use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, State,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

// Proxy status structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub port: u16,
    pub endpoint: String,
}

// Request log entry for live monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestLog {
    pub id: String,
    pub timestamp: u64,
    pub provider: String,
    pub model: String,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub duration_ms: u64,
    pub tokens_in: Option<u32>,
    pub tokens_out: Option<u32>,
}

impl Default for ProxyStatus {
    fn default() -> Self {
        Self {
            running: false,
            port: 8317,
            endpoint: "http://localhost:8317/v1".to_string(),
        }
    }
}

// Auth status for different providers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStatus {
    pub claude: bool,
    pub openai: bool,
    pub gemini: bool,
    pub qwen: bool,
}

impl Default for AuthStatus {
    fn default() -> Self {
        Self {
            claude: false,
            openai: false,
            gemini: false,
            qwen: false,
        }
    }
}

// App configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub port: u16,
    #[serde(rename = "autoStart")]
    pub auto_start: bool,
    #[serde(rename = "launchAtLogin")]
    pub launch_at_login: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: 8317,
            auto_start: true,
            launch_at_login: false,
        }
    }
}

// OAuth state for tracking pending auth flows
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthState {
    pub provider: String,
    pub state: String,
}

// App state
pub struct AppState {
    pub proxy_status: Mutex<ProxyStatus>,
    pub auth_status: Mutex<AuthStatus>,
    pub config: Mutex<AppConfig>,
    pub pending_oauth: Mutex<Option<OAuthState>>,
    pub proxy_process: Mutex<Option<CommandChild>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            proxy_status: Mutex::new(ProxyStatus::default()),
            auth_status: Mutex::new(AuthStatus::default()),
            config: Mutex::new(AppConfig::default()),
            pending_oauth: Mutex::new(None),
            proxy_process: Mutex::new(None),
        }
    }
}

// Config file path
fn get_config_path() -> std::path::PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("proxypal");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("config.json")
}

fn get_auth_path() -> std::path::PathBuf {
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("proxypal");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("auth.json")
}

// Load config from file
fn load_config() -> AppConfig {
    let path = get_config_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(config) = serde_json::from_str(&data) {
                return config;
            }
        }
    }
    AppConfig::default()
}

// Save config to file
fn save_config_to_file(config: &AppConfig) -> Result<(), String> {
    let path = get_config_path();
    let data = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

// Load auth status from file
fn load_auth_status() -> AuthStatus {
    let path = get_auth_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(auth) = serde_json::from_str(&data) {
                return auth;
            }
        }
    }
    AuthStatus::default()
}

// Save auth status to file
fn save_auth_to_file(auth: &AuthStatus) -> Result<(), String> {
    let path = get_auth_path();
    let data = serde_json::to_string_pretty(auth).map_err(|e| e.to_string())?;
    std::fs::write(path, data).map_err(|e| e.to_string())
}

// Parse CLIProxyAPI log output to extract request information
fn parse_request_log(line: &str, counter: &mut u64) -> Option<RequestLog> {
    // CLIProxyAPI logs requests in various formats, we'll try to extract useful info
    // Common patterns: "POST /v1/chat/completions 200 OK 1234ms"
    // or JSON logs: {"method": "POST", "path": "/v1/...", "status": 200}
    
    let line_lower = line.to_lowercase();
    
    // Skip non-request lines
    if !line_lower.contains("/v1/") && !line_lower.contains("chat") && !line_lower.contains("completions") {
        return None;
    }
    
    // Try to identify the provider from the path
    let provider = if line.contains("anthropic") || line.contains("claude") {
        "claude"
    } else if line.contains("openai") || line.contains("codex") {
        "openai"
    } else if line.contains("gemini") {
        "gemini"
    } else if line.contains("qwen") {
        "qwen"
    } else {
        "unknown"
    };
    
    // Try to extract HTTP method
    let method = if line.contains("POST") {
        "POST"
    } else if line.contains("GET") {
        "GET"
    } else {
        "POST" // Default for chat completions
    };
    
    // Try to extract status code
    let status = if line.contains(" 200") || line.contains("200 ") {
        200
    } else if line.contains(" 400") || line.contains("400 ") {
        400
    } else if line.contains(" 401") || line.contains("401 ") {
        401
    } else if line.contains(" 500") || line.contains("500 ") {
        500
    } else {
        200 // Assume success if not specified
    };
    
    // Extract duration if present (look for patterns like "123ms" or "1.23s")
    let duration_ms = extract_duration(line).unwrap_or(0);
    
    *counter += 1;
    
    Some(RequestLog {
        id: format!("req_{}", counter),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        provider: provider.to_string(),
        model: "auto".to_string(), // Could extract from request body if available
        method: method.to_string(),
        path: "/v1/chat/completions".to_string(),
        status,
        duration_ms,
        tokens_in: None,
        tokens_out: None,
    })
}

// Helper to extract duration from log line
fn extract_duration(line: &str) -> Option<u64> {
    // Look for patterns like "123ms", "1.5s", "1500ms"
    for word in line.split_whitespace() {
        if word.ends_with("ms") {
            if let Ok(ms) = word.trim_end_matches("ms").parse::<u64>() {
                return Some(ms);
            }
        } else if word.ends_with('s') && !word.ends_with("ms") {
            if let Ok(secs) = word.trim_end_matches('s').parse::<f64>() {
                return Some((secs * 1000.0) as u64);
            }
        }
    }
    None
}

// Tauri commands
#[tauri::command]
fn get_proxy_status(state: State<AppState>) -> ProxyStatus {
    state.proxy_status.lock().unwrap().clone()
}

#[tauri::command]
async fn start_proxy(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ProxyStatus, String> {
    let config = state.config.lock().unwrap().clone();
    
    // Check if already running
    {
        let status = state.proxy_status.lock().unwrap();
        if status.running {
            return Ok(status.clone());
        }
    }

    // Create config directory and config file for CLIProxyAPI
    let config_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("proxypal");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    
    let proxy_config_path = config_dir.join("proxy-config.yaml");
    
    // Generate a simple config for CLIProxyAPI with Management API enabled
    let proxy_config = format!(
        r#"# ProxyPal generated config
port: {}
auth-dir: "~/.cli-proxy-api"
api-keys:
  - "proxypal-local"
debug: false

# Enable Management API for OAuth flows
remote-management:
  allow-remote: false
  secret-key: "proxypal-mgmt-key"
  disable-control-panel: true
"#,
        config.port
    );
    
    std::fs::write(&proxy_config_path, proxy_config).map_err(|e| e.to_string())?;

    // Spawn the sidecar process
    let sidecar = app
        .shell()
        .sidecar("cliproxyapi")
        .map_err(|e| format!("Failed to create sidecar command: {}", e))?
        .args(["--config", proxy_config_path.to_str().unwrap()]);

    let (mut rx, child) = sidecar.spawn().map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Store the child process
    {
        let mut process = state.proxy_process.lock().unwrap();
        *process = Some(child);
    }

    // Listen for stdout/stderr in a separate task
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        use tauri_plugin_shell::process::CommandEvent;
        let mut request_counter: u64 = 0;
        
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let text = String::from_utf8_lossy(&line);
                    println!("[CLIProxyAPI] {}", text);
                    
                    // Try to parse request logs from CLIProxyAPI output
                    // Format varies but typically includes: method, path, status, duration
                    if let Some(log) = parse_request_log(&text, &mut request_counter) {
                        let _ = app_handle.emit("request-log", log);
                    }
                }
                CommandEvent::Stderr(line) => {
                    let text = String::from_utf8_lossy(&line);
                    eprintln!("[CLIProxyAPI ERROR] {}", text);
                }
                CommandEvent::Terminated(payload) => {
                    println!("[CLIProxyAPI] Process terminated: {:?}", payload);
                    // Update status when process dies unexpectedly
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        let mut status = state.proxy_status.lock().unwrap();
                        status.running = false;
                        let _ = app_handle.emit("proxy-status-changed", status.clone());
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    // Give it a moment to start
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    // Update status
    let new_status = {
        let mut status = state.proxy_status.lock().unwrap();
        status.running = true;
        status.port = config.port;
        status.endpoint = format!("http://localhost:{}/v1", config.port);
        status.clone()
    };

    // Emit status update
    let _ = app.emit("proxy-status-changed", new_status.clone());

    Ok(new_status)
}

#[tauri::command]
async fn stop_proxy(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<ProxyStatus, String> {
    // Check if running
    {
        let status = state.proxy_status.lock().unwrap();
        if !status.running {
            return Ok(status.clone());
        }
    }

    // Kill the child process
    {
        let mut process = state.proxy_process.lock().unwrap();
        if let Some(child) = process.take() {
            child.kill().map_err(|e| format!("Failed to kill process: {}", e))?;
        }
    }

    // Update status
    let new_status = {
        let mut status = state.proxy_status.lock().unwrap();
        status.running = false;
        status.clone()
    };

    // Emit status update
    let _ = app.emit("proxy-status-changed", new_status.clone());

    Ok(new_status)
}

#[tauri::command]
fn get_auth_status(state: State<AppState>) -> AuthStatus {
    state.auth_status.lock().unwrap().clone()
}

#[tauri::command]
async fn open_oauth(app: tauri::AppHandle, state: State<'_, AppState>, provider: String) -> Result<String, String> {
    // Get proxy port from config
    let port = {
        let config = state.config.lock().unwrap();
        config.port
    };

    // Get the OAuth URL from CLIProxyAPI's Management API
    // Add is_webui=true to use the embedded callback forwarder
    let endpoint = match provider.as_str() {
        "claude" => format!("http://localhost:{}/v0/management/anthropic-auth-url?is_webui=true", port),
        "openai" => format!("http://localhost:{}/v0/management/codex-auth-url?is_webui=true", port),
        "gemini" => format!("http://localhost:{}/v0/management/gemini-cli-auth-url?is_webui=true", port),
        "qwen" => format!("http://localhost:{}/v0/management/qwen-auth-url?is_webui=true", port),
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    // Make HTTP request to get OAuth URL
    let client = reqwest::Client::new();
    let response = client
        .get(&endpoint)
        .header("X-Management-Key", "proxypal-mgmt-key")
        .send()
        .await
        .map_err(|e| format!("Failed to get OAuth URL: {}. Is the proxy running?", e))?;

    if !response.status().is_success() {
        return Err(format!("Management API returned error: {}", response.status()));
    }

    // Parse response to get URL and state
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let oauth_url = body["url"]
        .as_str()
        .ok_or("No URL in response")?
        .to_string();
    
    let oauth_state = body["state"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // Store pending OAuth state
    {
        let mut pending = state.pending_oauth.lock().unwrap();
        *pending = Some(OAuthState {
            provider: provider.clone(),
            state: oauth_state.clone(),
        });
    }

    // Open the OAuth URL in the default browser
    app.opener()
        .open_url(&oauth_url, None::<&str>)
        .map_err(|e| e.to_string())?;

    // Return the state so frontend can poll for completion
    Ok(oauth_state)
}

#[tauri::command]
async fn poll_oauth_status(state: State<'_, AppState>, oauth_state: String) -> Result<bool, String> {
    let port = {
        let config = state.config.lock().unwrap();
        config.port
    };

    let endpoint = format!(
        "http://localhost:{}/v0/management/get-auth-status?state={}",
        port, oauth_state
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&endpoint)
        .header("X-Management-Key", "proxypal-mgmt-key")
        .send()
        .await
        .map_err(|e| format!("Failed to poll OAuth status: {}", e))?;

    if !response.status().is_success() {
        return Ok(false); // Not ready yet
    }

    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Check if auth is complete - CLIProxyAPI returns { "status": "ok" } when done
    let status = body["status"].as_str().unwrap_or("wait");
    Ok(status == "ok")
}

#[tauri::command]
async fn refresh_auth_status(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<AuthStatus, String> {
    // Check CLIProxyAPI's auth directory for credentials
    let auth_dir = dirs::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".cli-proxy-api");

    let mut new_auth = AuthStatus::default();

    // Scan auth directory for credential files
    if let Ok(entries) = std::fs::read_dir(&auth_dir) {
        for entry in entries.flatten() {
            let filename = entry.file_name().to_string_lossy().to_lowercase();
            
            // CLIProxyAPI naming patterns:
            // - claude-{email}.json or anthropic-*.json
            // - codex-{email}.json
            // - gemini-{email}-{project}.json
            // - qwen-{email}.json
            // - iflow-{email}.json
            
            if filename.ends_with(".json") {
                if filename.starts_with("claude-") || filename.starts_with("anthropic-") {
                    new_auth.claude = true;
                } else if filename.starts_with("codex-") {
                    new_auth.openai = true;
                } else if filename.starts_with("gemini-") {
                    new_auth.gemini = true;
                } else if filename.starts_with("qwen-") {
                    new_auth.qwen = true;
                }
            }
        }
    }

    // Update state
    {
        let mut auth = state.auth_status.lock().unwrap();
        *auth = new_auth.clone();
    }

    // Save to our config
    save_auth_to_file(&new_auth)?;

    // Emit auth status update
    let _ = app.emit("auth-status-changed", new_auth.clone());

    Ok(new_auth)
}

#[tauri::command]
async fn complete_oauth(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    provider: String,
    code: String,
) -> Result<AuthStatus, String> {
    // In a real implementation, we would:
    // 1. Exchange the code for tokens
    // 2. Store the tokens securely (keychain/credential manager)
    // 3. Update the auth status
    let _ = code; // Mark as used

    // For now, just mark as authenticated
    {
        let mut auth = state.auth_status.lock().unwrap();
        match provider.as_str() {
            "claude" => auth.claude = true,
            "openai" => auth.openai = true,
            "gemini" => auth.gemini = true,
            "qwen" => auth.qwen = true,
            _ => return Err(format!("Unknown provider: {}", provider)),
        }

        // Save to file
        save_auth_to_file(&auth)?;

        // Clear pending OAuth
        let mut pending = state.pending_oauth.lock().unwrap();
        *pending = None;

        // Emit auth status update
        let _ = app.emit("auth-status-changed", auth.clone());

        Ok(auth.clone())
    }
}

#[tauri::command]
async fn disconnect_provider(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    provider: String,
) -> Result<AuthStatus, String> {
    let mut auth = state.auth_status.lock().unwrap();

    match provider.as_str() {
        "claude" => auth.claude = false,
        "openai" => auth.openai = false,
        "gemini" => auth.gemini = false,
        "qwen" => auth.qwen = false,
        _ => return Err(format!("Unknown provider: {}", provider)),
    }

    // Save to file
    save_auth_to_file(&auth)?;

    // Emit auth status update
    let _ = app.emit("auth-status-changed", auth.clone());

    Ok(auth.clone())
}

#[tauri::command]
fn get_config(state: State<AppState>) -> AppConfig {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn save_config(state: State<AppState>, config: AppConfig) -> Result<(), String> {
    let mut current_config = state.config.lock().unwrap();
    *current_config = config.clone();
    save_config_to_file(&config)
}

// Provider health status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderHealth {
    pub claude: HealthStatus,
    pub openai: HealthStatus,
    pub gemini: HealthStatus,
    pub qwen: HealthStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub status: String,  // "healthy", "degraded", "offline", "unconfigured"
    pub latency_ms: Option<u64>,
    pub last_checked: u64,
}

impl Default for HealthStatus {
    fn default() -> Self {
        Self {
            status: "unconfigured".to_string(),
            latency_ms: None,
            last_checked: 0,
        }
    }
}

#[tauri::command]
async fn check_provider_health(state: State<'_, AppState>) -> Result<ProviderHealth, String> {
    let config = state.config.lock().unwrap().clone();
    let auth = state.auth_status.lock().unwrap().clone();
    let proxy_running = state.proxy_status.lock().unwrap().running;
    
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    // If proxy isn't running, all providers are offline
    if !proxy_running {
        return Ok(ProviderHealth {
            claude: HealthStatus { status: "offline".to_string(), latency_ms: None, last_checked: timestamp },
            openai: HealthStatus { status: "offline".to_string(), latency_ms: None, last_checked: timestamp },
            gemini: HealthStatus { status: "offline".to_string(), latency_ms: None, last_checked: timestamp },
            qwen: HealthStatus { status: "offline".to_string(), latency_ms: None, last_checked: timestamp },
        });
    }
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    let endpoint = format!("http://localhost:{}/v1/models", config.port);
    
    // Check proxy health by requesting models endpoint
    let start = std::time::Instant::now();
    let response = client.get(&endpoint)
        .header("Authorization", "Bearer proxypal-local")
        .send()
        .await;
    let latency = start.elapsed().as_millis() as u64;
    
    let proxy_healthy = response.map(|r| r.status().is_success()).unwrap_or(false);
    
    Ok(ProviderHealth {
        claude: if auth.claude && proxy_healthy {
            HealthStatus { status: "healthy".to_string(), latency_ms: Some(latency), last_checked: timestamp }
        } else if auth.claude {
            HealthStatus { status: "degraded".to_string(), latency_ms: None, last_checked: timestamp }
        } else {
            HealthStatus { status: "unconfigured".to_string(), latency_ms: None, last_checked: timestamp }
        },
        openai: if auth.openai && proxy_healthy {
            HealthStatus { status: "healthy".to_string(), latency_ms: Some(latency), last_checked: timestamp }
        } else if auth.openai {
            HealthStatus { status: "degraded".to_string(), latency_ms: None, last_checked: timestamp }
        } else {
            HealthStatus { status: "unconfigured".to_string(), latency_ms: None, last_checked: timestamp }
        },
        gemini: if auth.gemini && proxy_healthy {
            HealthStatus { status: "healthy".to_string(), latency_ms: Some(latency), last_checked: timestamp }
        } else if auth.gemini {
            HealthStatus { status: "degraded".to_string(), latency_ms: None, last_checked: timestamp }
        } else {
            HealthStatus { status: "unconfigured".to_string(), latency_ms: None, last_checked: timestamp }
        },
        qwen: if auth.qwen && proxy_healthy {
            HealthStatus { status: "healthy".to_string(), latency_ms: Some(latency), last_checked: timestamp }
        } else if auth.qwen {
            HealthStatus { status: "degraded".to_string(), latency_ms: None, last_checked: timestamp }
        } else {
            HealthStatus { status: "unconfigured".to_string(), latency_ms: None, last_checked: timestamp }
        },
    })
}

// Handle deep link OAuth callback
fn handle_deep_link(app: &tauri::AppHandle, urls: Vec<url::Url>) {
    for url in urls {
        if url.scheme() == "proxypal" && url.path() == "/oauth/callback" {
            // Parse query parameters
            let params: std::collections::HashMap<_, _> = url.query_pairs().collect();

            if let (Some(code), Some(state)) = (params.get("code"), params.get("state")) {
                // Verify state and get provider from pending OAuth
                let app_state = app.state::<AppState>();
                let pending = app_state.pending_oauth.lock().unwrap().clone();

                if let Some(oauth) = pending {
                    if oauth.state == state.as_ref() {
                        // Emit event to frontend
                        let _ = app.emit(
                            "oauth-callback",
                            serde_json::json!({
                                "provider": oauth.provider,
                                "code": code.as_ref()
                            }),
                        );
                    }
                }
            }

            // Bring window to front
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

// Setup system tray
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let toggle_item = MenuItem::with_id(app, "toggle", "Toggle Proxy", true, None::<&str>)?;
    let dashboard_item = MenuItem::with_id(app, "dashboard", "Open Dashboard", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit ProxyPal", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&toggle_item, &dashboard_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("ProxyPal - Proxy stopped")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "toggle" => {
                let app_state = app.state::<AppState>();
                let is_running = app_state.proxy_status.lock().unwrap().running;

                // Emit toggle event to frontend
                let _ = app.emit("tray-toggle-proxy", !is_running);
            }
            "dashboard" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load persisted config and auth
    let config = load_config();
    let auth = load_auth_status();

    let app_state = AppState {
        proxy_status: Mutex::new(ProxyStatus::default()),
        auth_status: Mutex::new(auth),
        config: Mutex::new(config),
        pending_oauth: Mutex::new(None),
        proxy_process: Mutex::new(None),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Handle deep links when app is already running
            let urls: Vec<url::Url> = args
                .iter()
                .filter_map(|arg| url::Url::parse(arg).ok())
                .collect();
            if !urls.is_empty() {
                handle_deep_link(app, urls);
            }

            // Show existing window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(app_state)
        .setup(|app| {
            // Setup system tray
            #[cfg(desktop)]
            setup_tray(app)?;

            // Register deep link handler for when app is already running
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    let urls: Vec<url::Url> = event.urls().to_vec();
                    if !urls.is_empty() {
                        handle_deep_link(&handle, urls);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_proxy_status,
            start_proxy,
            stop_proxy,
            get_auth_status,
            refresh_auth_status,
            open_oauth,
            poll_oauth_status,
            complete_oauth,
            disconnect_provider,
            get_config,
            save_config,
            check_provider_health,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
