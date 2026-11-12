// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Manager, RunEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const PORT: u16 = 4100;

fn get_smith_dir() -> Option<PathBuf> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    let dir = PathBuf::from(home).join(".smith");
    let _ = fs::create_dir_all(&dir);
    Some(dir)
}

fn log_msg(msg: &str) {
    if let Some(dir) = get_smith_dir() {
        let log_file = dir.join("tauri.log");
        if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(log_file) {
            let _ = writeln!(file, "[tauri] {}", msg);
        }
    }
    println!("[tauri] {}", msg);
}

fn check_server_health(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    if let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(300)) {
        let _ = stream.set_read_timeout(Some(Duration::from_millis(300)));
        let _ = stream.set_write_timeout(Some(Duration::from_millis(300)));
        let request = b"GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
        if stream.write_all(request).is_ok() {
            let mut response = [0u8; 128];
            if let Ok(n) = stream.read(&mut response) {
                let response_str = String::from_utf8_lossy(&response[..n]);
                return response_str.starts_with("HTTP/1.1 200") || response_str.starts_with("HTTP/1.0 200");
            }
        }
    }
    false
}

fn clean_path(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy().to_string();
    if s.starts_with(r"\\?\") {
        PathBuf::from(&s[4..])
    } else {
        p
    }
}

fn find_file_in_candidates(candidates: &[PathBuf]) -> Option<PathBuf> {
    for c in candidates {
        if c.exists() {
            let canon = fs::canonicalize(c).unwrap_or_else(|_| c.clone());
            return Some(clean_path(canon));
        }
    }
    None
}

fn locate_server_and_dist() -> (Option<PathBuf>, Option<PathBuf>) {
    let mut server_candidates = Vec::new();
    let mut dist_candidates = Vec::new();

    // 1. Current working directory
    if let Ok(cwd) = std::env::current_dir() {
        server_candidates.push(cwd.join("dist-server").join("index.cjs"));
        dist_candidates.push(cwd.join("dist"));
    }

    // 2. Executable location and its ancestor directories
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            // Alongside executable or inside resources
            server_candidates.push(exe_dir.join("dist-server").join("index.cjs"));
            server_candidates.push(exe_dir.join("resources").join("dist-server").join("index.cjs"));
            server_candidates.push(exe_dir.join("Resources").join("dist-server").join("index.cjs"));
            dist_candidates.push(exe_dir.join("dist"));
            dist_candidates.push(exe_dir.join("resources").join("dist"));
            dist_candidates.push(exe_dir.join("Resources").join("dist"));

            // macOS bundle structure: Smith.app/Contents/MacOS/smith -> Contents/Resources/
            if let Some(contents_dir) = exe_dir.parent() {
                server_candidates.push(contents_dir.join("Resources").join("dist-server").join("index.cjs"));
                server_candidates.push(contents_dir.join("Resources").join("resources").join("dist-server").join("index.cjs"));
                // Tauri places resources declared as "../dist-server/**/*" under Resources/_up_/
                server_candidates.push(contents_dir.join("Resources").join("_up_").join("dist-server").join("index.cjs"));
                dist_candidates.push(contents_dir.join("Resources").join("dist"));
                dist_candidates.push(contents_dir.join("Resources").join("resources").join("dist"));
                dist_candidates.push(contents_dir.join("Resources").join("_up_").join("dist"));
            }

            // Check parent levels (e.g. target/release/smith.exe -> 3 levels up is project root)
            let mut curr = exe_dir;
            for _ in 0..4 {
                if let Some(p) = curr.parent() {
                    server_candidates.push(p.join("dist-server").join("index.cjs"));
                    server_candidates.push(p.join("resources").join("dist-server").join("index.cjs"));
                    server_candidates.push(p.join("Resources").join("dist-server").join("index.cjs"));
                    dist_candidates.push(p.join("dist"));
                    dist_candidates.push(p.join("resources").join("dist"));
                    dist_candidates.push(p.join("Resources").join("dist"));
                    curr = p;
                } else {
                    break;
                }
            }
        }
    }

    let server_path = find_file_in_candidates(&server_candidates);
    let dist_path = find_file_in_candidates(&dist_candidates);

    (server_path, dist_path)
}

fn find_node_executable() -> PathBuf {
    #[cfg(windows)]
    let standard_paths = [
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
    ];
    #[cfg(not(windows))]
    let standard_paths = [
        "/opt/homebrew/opt/node@22/bin/node",
        "/usr/local/opt/node@22/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
    ];

    for p in &standard_paths {
        let pb = PathBuf::from(p);
        if pb.exists() {
            return pb;
        }
    }
    PathBuf::from("node")
}

fn spawn_backend_server() -> Option<Child> {
    if check_server_health(PORT) {
        log_msg(&format!("Backend server already running and healthy on port {}", PORT));
        return None;
    }

    let (server_script, dist_path) = locate_server_and_dist();
    let script = match server_script {
        Some(s) => s,
        None => {
            log_msg("Warning: Could not locate dist-server/index.cjs in candidates!");
            return None;
        }
    };

    let node_exe = find_node_executable();
    log_msg(&format!("Spawning backend using {:?} with script {:?}", node_exe, script));

    let mut cmd = Command::new(node_exe);
    cmd.arg(&script);
    cmd.env("PORT", PORT.to_string());
    cmd.env("UV_PYTHON", "3.12");

    if let Some(dp) = dist_path {
        log_msg(&format!("Setting DIST_PATH to {:?}", dp));
        cmd.env("DIST_PATH", dp.to_string_lossy().to_string());
    }

    // Set working directory to project root (parent of dist-server)
    if let Some(parent) = script.parent().and_then(|p| p.parent()) {
        cmd.current_dir(parent);
        log_msg(&format!("Set child working directory to {:?}", parent));
    }

    // Ensure user local bin and package manager paths are on PATH for Astral uv / uvx / node
    let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).ok();
    if let Some(h) = home {
        let local_bin = PathBuf::from(&h).join(".local").join("bin");
        if let Ok(current_path) = std::env::var("PATH") {
            #[cfg(windows)]
            let sep = ";";
            #[cfg(not(windows))]
            let sep = ":";

            let mut extra_paths = Vec::new();
            let local_bin_str = local_bin.to_string_lossy().to_string();
            if local_bin.exists() && !current_path.contains(&local_bin_str) {
                extra_paths.push(local_bin_str);
            }
            #[cfg(target_os = "macos")]
            {
                if PathBuf::from("/opt/homebrew/opt/node@22/bin").exists() {
                    extra_paths.push("/opt/homebrew/opt/node@22/bin".to_string());
                }
                if PathBuf::from("/usr/local/opt/node@22/bin").exists() {
                    extra_paths.push("/usr/local/opt/node@22/bin".to_string());
                }
                if PathBuf::from("/opt/homebrew/bin").exists() && !current_path.contains("/opt/homebrew/bin") {
                    extra_paths.push("/opt/homebrew/bin".to_string());
                }
                if PathBuf::from("/usr/local/bin").exists() && !current_path.contains("/usr/local/bin") {
                    extra_paths.push("/usr/local/bin".to_string());
                }
            }
            if !extra_paths.is_empty() {
                cmd.env("PATH", format!("{}{}{}", extra_paths.join(sep), sep, current_path));
            }
        }
    }

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.spawn() {
        Ok(child) => {
            log_msg(&format!("Backend spawned successfully with PID: {}", child.id()));
            Some(child)
        }
        Err(e) => {
            log_msg(&format!("Failed to spawn backend process: {}", e));
            None
        }
    }
}

fn main() {
    log_msg("Smith starting up...");

    let child_handle: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_setup = Arc::clone(&child_handle);
    let child_for_exit = Arc::clone(&child_handle);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            // Spawn backend server
            let child = spawn_backend_server();
            if let Ok(mut lock) = child_for_setup.lock() {
                *lock = child;
            }

            // Supervise backend health and navigate window
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let mut ready = false;
                for i in 0..120 {
                    if check_server_health(PORT) {
                        ready = true;
                        log_msg(&format!("Backend confirmed healthy after {} checks!", i + 1));
                        break;
                    }
                    thread::sleep(Duration::from_millis(250));
                }

                let target_url = format!("http://127.0.0.1:{}", PORT);
                let window = app_handle.get_webview_window("main")
                    .or_else(|| app_handle.webview_windows().values().next().cloned());

                if let Some(w) = window {
                    if ready {
                        log_msg(&format!("Navigating webview to {}", target_url));
                        if let Ok(url) = tauri::Url::parse(&target_url) {
                            let _ = w.navigate(url);
                        }
                    } else {
                        log_msg("Backend health check timed out; showing window on current content");
                    }
                    let _ = w.show();
                    let _ = w.set_focus();
                } else {
                    log_msg("Warning: Could not find webview window to navigate/show");
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building smith application")
        .run(move |_app_handle, event| {
            match event {
                RunEvent::Exit | RunEvent::ExitRequested { .. } => {
                    log_msg("Application exit requested, terminating backend server...");
                    if let Ok(mut lock) = child_for_exit.lock() {
                        if let Some(mut child) = lock.take() {
                            let _ = child.kill();
                            log_msg("Backend server child process terminated.");
                        }
                    }
                }
                _ => {}
            }
        });
}
