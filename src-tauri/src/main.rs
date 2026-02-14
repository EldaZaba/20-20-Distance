#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

// Shared timer and reset state.
#[derive(Debug)]
struct AppState {
  interval_minutes: AtomicU64,
  reset_seq: AtomicU64,
  paused: AtomicBool,
}

// Interval in minutes for the background timer.
#[tauri::command]
fn set_interval(minutes: u64, state: tauri::State<AppState>) {
  state.interval_minutes.store(minutes, Ordering::SeqCst);
}

#[tauri::command]
fn reset_timer(state: tauri::State<AppState>, app: AppHandle) {
  state.reset_seq.fetch_add(1, Ordering::SeqCst);
  state.paused.store(false, Ordering::SeqCst);
  hide_overlay(&app);

  let minutes = state.interval_minutes.load(Ordering::SeqCst);
  let total_seconds = minutes.saturating_mul(60);
  let _ = app.emit(
    "timer:tick",
    serde_json::json!({
      "remainingSeconds": total_seconds,
      "totalSeconds": total_seconds,
      "paused": false
    }),
  );
  let _ = app.emit("timer:state", serde_json::json!({ "paused": false }));
}

// Called by frontend when a break session is complete.
#[tauri::command]
fn session_complete(app: AppHandle) {
  hide_overlay(&app);
}

#[tauri::command]
fn pause_timer(state: tauri::State<AppState>, app: AppHandle) {
  state.paused.store(true, Ordering::SeqCst);
  let _ = app.emit("timer:state", serde_json::json!({ "paused": true }));
}

#[tauri::command]
fn resume_timer(state: tauri::State<AppState>, app: AppHandle) {
  state.paused.store(false, Ordering::SeqCst);
  let _ = app.emit("timer:state", serde_json::json!({ "paused": false }));
}

#[tauri::command]
fn is_timer_paused(state: tauri::State<AppState>) -> bool {
  state.paused.load(Ordering::SeqCst)
}

fn find_project_root() -> Option<PathBuf> {
  let cwd = std::env::current_dir().ok()?;
  for ancestor in cwd.ancestors().take(6) {
    if ancestor.join("package.json").exists() {
      return Some(ancestor.to_path_buf());
    }
  }
  None
}

fn project_audio_dir() -> Option<PathBuf> {
  find_project_root().map(|root| root.join("sounds"))
}

fn appdata_audio_dir(app: &AppHandle) -> Option<PathBuf> {
  app.path().resolve("sounds", BaseDirectory::AppData).ok()
}

fn audio_dir(app: &AppHandle) -> Option<PathBuf> {
  if let Some(dir) = project_audio_dir() {
    if std::fs::create_dir_all(&dir).is_ok() {
      return Some(dir);
    }
  }
  appdata_audio_dir(app)
}

fn ensure_audio_dir(app: &AppHandle) {
  if let Some(dir) = audio_dir(app) {
    let _ = std::fs::create_dir_all(&dir);
  }
}

#[tauri::command]
fn get_audio_dir(app: AppHandle) -> Option<String> {
  if let Some(dir) = audio_dir(&app) {
    let _ = std::fs::create_dir_all(&dir);
    return Some(dir.to_string_lossy().to_string());
  }
  None
}

#[tauri::command]
fn get_audio_file(app: AppHandle) -> Option<String> {
  let appdata_dir = appdata_audio_dir(&app)?;
  let _ = std::fs::create_dir_all(&appdata_dir);

  let pick_wav = |dir: &PathBuf| -> Option<PathBuf> {
    let preferred = dir.join("alert.wav");
    if preferred.exists() {
      return Some(preferred);
    }

    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
      let path = entry.path();
      if let Some(ext) = path.extension().and_then(|value| value.to_str()) {
        if ext.eq_ignore_ascii_case("wav") {
          return Some(path);
        }
      }
    }
    None
  };

  if let Some(project_dir) = project_audio_dir() {
    let _ = std::fs::create_dir_all(&project_dir);
    if let Some(source) = pick_wav(&project_dir) {
      let file_name = source.file_name()?.to_os_string();
      let destination = appdata_dir.join(file_name);
      let should_copy = if destination.exists() {
        match (std::fs::metadata(&source), std::fs::metadata(&destination)) {
          (Ok(src), Ok(dst)) => src.len() != dst.len(),
          _ => true,
        }
      } else {
        true
      };

      if should_copy {
        let _ = std::fs::copy(&source, &destination);
      }

      return Some(destination.to_string_lossy().to_string());
    }
  }

  if let Some(source) = pick_wav(&appdata_dir) {
    return Some(source.to_string_lossy().to_string());
  }

  if let Ok(resource_dir) = app.path().resolve("sounds", BaseDirectory::Resource) {
    if let Some(source) = pick_wav(&resource_dir) {
      return Some(source.to_string_lossy().to_string());
    }
  }

  None
}

fn hide_overlay(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("overlay") {
    let _ = window.hide();
    let _ = window.emit("overlay:hide", ());
  }
}

fn open_settings(app: &AppHandle, show_stats: bool) {
  if let Some(window) = app.get_webview_window("settings") {
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit(
      "settings:open",
      serde_json::json!({ "tab": if show_stats { "stats" } else { "settings" } }),
    );
  }
}

// Build tray menu and wire event handlers.
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
  let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
  let stats = MenuItem::with_id(app, "stats", "Progress", true, None::<&str>)?;
  let toggle_sound = MenuItem::with_id(app, "toggle_sound", "Sound On / Off", true, None::<&str>)?;

  let interval_1 = MenuItem::with_id(app, "interval_1", "1 min", true, None::<&str>)?;
  let interval_10 = MenuItem::with_id(app, "interval_10", "10 min", true, None::<&str>)?;
  let interval_20 = MenuItem::with_id(app, "interval_20", "20 min", true, None::<&str>)?;
  let interval_30 = MenuItem::with_id(app, "interval_30", "30 min", true, None::<&str>)?;
  let interval_45 = MenuItem::with_id(app, "interval_45", "45 min", true, None::<&str>)?;
  let interval_60 = MenuItem::with_id(app, "interval_60", "60 min", true, None::<&str>)?;

  let interval_menu = Submenu::with_id_and_items(
    app,
    "interval",
    "Interval",
    true,
    &[
      &interval_1,
      &interval_10,
      &interval_20,
      &interval_30,
      &interval_45,
      &interval_60,
    ],
  )?;

  let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

  let menu = Menu::with_items(
    app,
    &[&settings, &interval_menu, &toggle_sound, &stats, &quit],
  )?;

  let tray_icon = Image::from_bytes(include_bytes!("../icons/tray.png"))?;

  TrayIconBuilder::new()
    .icon(tray_icon)
    .tooltip("20-20 Distance")
    .menu(&menu)
    .on_menu_event(|app, event| match event.id().as_ref() {
      "settings" => open_settings(app, false),
      "stats" => open_settings(app, true),
      "toggle_sound" => {
        let _ = app.emit("settings:toggleSound", ());
      }
      "interval_1" => set_interval_from_tray(app, 1),
      "interval_10" => set_interval_from_tray(app, 10),
      "interval_20" => set_interval_from_tray(app, 20),
      "interval_30" => set_interval_from_tray(app, 30),
      "interval_45" => set_interval_from_tray(app, 45),
      "interval_60" => set_interval_from_tray(app, 60),
      "quit" => app.exit(0),
      _ => {}
    })
    .build(app)?;

  Ok(())
}

fn set_interval_from_tray(app: &AppHandle, minutes: u64) {
  let state = app.state::<AppState>();
  state.interval_minutes.store(minutes, Ordering::SeqCst);
  let _ = app.emit("settings:update", serde_json::json!({ "intervalMinutes": minutes }));
}

// Main loop: wait for interval and emit reminder events.
fn start_timer(app: AppHandle) {
  std::thread::spawn(move || loop {
    let state = app.state::<AppState>();
    let last_reset = state.reset_seq.load(Ordering::SeqCst);
    let minutes = state.interval_minutes.load(Ordering::SeqCst);
    let total_seconds = minutes.saturating_mul(60);
    let mut remaining = total_seconds;
    let mut reset_triggered = false;

    loop {
      let current_reset = state.reset_seq.load(Ordering::SeqCst);
      if current_reset != last_reset {
        reset_triggered = true;
        break;
      }

      let paused = state.paused.load(Ordering::SeqCst);
      if paused {
        let _ = app.emit(
          "timer:tick",
          serde_json::json!({
            "remainingSeconds": remaining,
            "totalSeconds": total_seconds,
            "paused": true
          }),
        );
        std::thread::sleep(Duration::from_millis(250));
        continue;
      }

      if remaining == 0 {
        break;
      }

      let _ = app.emit(
        "timer:tick",
        serde_json::json!({
          "remainingSeconds": remaining,
          "totalSeconds": total_seconds,
          "paused": false
        }),
      );

      std::thread::sleep(Duration::from_secs(1));

      let current_reset = state.reset_seq.load(Ordering::SeqCst);
      if current_reset != last_reset {
        reset_triggered = true;
        break;
      }

      if !state.paused.load(Ordering::SeqCst) {
        remaining = remaining.saturating_sub(1);
      }
    }

    if reset_triggered {
      continue;
    }

    state.paused.store(false, Ordering::SeqCst);
    let _ = app.emit(
      "timer:tick",
      serde_json::json!({ "remainingSeconds": 0, "totalSeconds": total_seconds, "paused": false }),
    );
    let _ = app.emit("timer:state", serde_json::json!({ "paused": false }));
    let _ = app.emit("timer:elapsed", ());
  });
}

fn main() {
  let builder = tauri::Builder::default();

  #[cfg(desktop)]
  let builder =
    builder.plugin(tauri_plugin_autostart::init(
      tauri_plugin_autostart::MacosLauncher::LaunchAgent,
      None,
    ));

  let builder = builder.plugin(tauri_plugin_notification::init());

  builder
    .setup(|app| {
      app.manage(AppState {
        interval_minutes: AtomicU64::new(20),
        reset_seq: AtomicU64::new(0),
        paused: AtomicBool::new(false),
      });

      build_tray(app)?;
      ensure_audio_dir(app.handle());
      start_timer(app.handle().clone());

      #[cfg(desktop)]
      {
        use tauri_plugin_autostart::ManagerExt;

        let autostart_manager = app.autolaunch();
        let _ = autostart_manager.enable();
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .invoke_handler(tauri::generate_handler![
      set_interval,
      reset_timer,
      session_complete,
      pause_timer,
      resume_timer,
      is_timer_paused,
      get_audio_dir,
      get_audio_file
    ])
    .run(tauri::generate_context!())
    .expect("Failed to start Tauri app");
}
