use std::fs;
use std::path::Path;

fn main() {
    // Ensure ../dist and ../dist-server exist with at least one file so tauri_build glob patterns succeed
    let dist = Path::new("../dist");
    let dist_server = Path::new("../dist-server");
    let _ = fs::create_dir_all(dist);
    let _ = fs::create_dir_all(dist_server);

    let placeholder_dist = dist.join(".gitkeep");
    if !placeholder_dist.exists() {
        let _ = fs::write(placeholder_dist, "");
    }

    let placeholder_server = dist_server.join(".gitkeep");
    if !placeholder_server.exists() {
        let _ = fs::write(placeholder_server, "");
    }

    tauri_build::build()
}
