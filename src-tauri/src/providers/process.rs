use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::oneshot;

use super::ChatEvent;
use crate::i18n::tr;

/// Tiempo máximo de una consulta antes de matar el proceso.
/// Error returned when the user stops a request, in either language.
pub fn stopped_message() -> &'static str {
    tr("Request stopped.", "Consulta detenida.")
}

/// Whether an error is the user's own «Stop» (not a failure).
pub fn is_stopped(e: &str) -> bool {
    e == "Request stopped." || e == "Consulta detenida."
}

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(180);

/// Busca el ejecutable en el PATH (en Windows también encuentra `.cmd`/`.exe`).
pub fn resolve(binary: &str) -> Option<PathBuf> {
    which::which(binary).ok()
}

pub struct Output {
    pub status_ok: bool,
    pub stdout: String,
    pub stderr: String,
}

pub(super) fn command(bin: &Path) -> Command {
    let mut cmd = Command::new(bin);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: que no aparezca una consola por cada consulta.
        cmd.creation_flags(0x0800_0000);
    }
    cmd.kill_on_drop(true);
    cmd
}

pub async fn run_capture(bin: &Path, args: &[&str]) -> std::io::Result<Output> {
    let out = command(bin)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .await?;
    Ok(Output {
        status_ok: out.status.success(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

/// Resume la salida de error de un CLI: corta el backtrace de Rust (que solo
/// trae líneas `N: <unknown>`) y, si hay una línea `Error...`, la prefiere.
pub fn tail(text: &str, n: usize) -> String {
    let text = text.split("Stack backtrace:").next().unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    if let Some(err) = lines
        .iter()
        .rev()
        .find(|l| l.trim_start().starts_with("Error"))
    {
        return err.trim().to_string();
    }
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// Qué hacer con cada cosa que reconoce el parser.
#[derive(Debug, PartialEq)]
pub enum Parsed {
    Event(ChatEvent),
    /// El CLI intentó algo prohibido (ejecutar comandos, tocar archivos):
    /// se mata el proceso y se informa el error.
    Abort(String),
}

pub struct StreamOptions<'a> {
    pub workdir: &'a Path,
    pub stdin: &'a str,
    pub timeout: Duration,
    pub cancel: Option<oneshot::Receiver<()>>,
}

/// Ejecuta el CLI, le pasa el prompt por stdin y va emitiendo eventos por
/// cada línea JSON de su salida. Se puede cancelar y tiene un tiempo máximo.
pub async fn stream(
    bin: &Path,
    args: &[String],
    opts: StreamOptions<'_>,
    parse: fn(&str) -> Vec<Parsed>,
    send: &(dyn Fn(ChatEvent) + Send + Sync),
) -> Result<(), String> {
    let mut child = command(bin)
        .args(args)
        .current_dir(opts.workdir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            tr(
                format!("Couldn't run {}: {e}", bin.display()),
                format!("No pude ejecutar {}: {e}", bin.display()),
            )
        })?;

    // stdin en su propia tarea: así un prompt grande no se bloquea mientras el
    // hijo escribe stdout, y si el CLI sale sin leerlo (flag inválido, sin
    // sesión) el "broken pipe" no tapa el mensaje real de stderr.
    let mut stdin = child.stdin.take().expect("stdin piped");
    let input = opts.stdin.as_bytes().to_vec();
    tokio::spawn(async move {
        let _ = stdin.write_all(&input).await;
        let _ = stdin.shutdown().await;
    });

    let mut stderr = child.stderr.take().expect("stderr piped");
    let stderr_task = tokio::spawn(async move {
        let mut buf = Vec::new();
        let _ = stderr.read_to_end(&mut buf).await;
        String::from_utf8_lossy(&buf).into_owned()
    });

    let mut reader = BufReader::new(child.stdout.take().expect("stdout piped"));
    let read_all = async {
        let mut saw_error = false;
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) => return Ok(saw_error),
                Ok(_) => {}
                Err(e) => return Err(e.to_string()),
            }
            // UTF-8 inválido no corta la respuesta.
            let line = String::from_utf8_lossy(&buf);
            for p in parse(line.trim_end()) {
                match p {
                    Parsed::Event(ev) => {
                        saw_error |= matches!(ev, ChatEvent::Error { .. });
                        send(ev);
                    }
                    Parsed::Abort(msg) => return Err(msg),
                }
            }
        }
    };

    let cancel = async {
        match opts.cancel {
            Some(rx) => {
                let _ = rx.await;
            }
            None => std::future::pending::<()>().await,
        }
    };

    let outcome = tokio::select! {
        r = read_all => r,
        _ = cancel => Err(stopped_message().to_string()),
        _ = tokio::time::sleep(opts.timeout) => Err(tr(
            format!("The model took more than {} s to answer; I stopped the request.", opts.timeout.as_secs()),
            format!("El modelo tardó más de {} s en responder; detuve la consulta.", opts.timeout.as_secs()),
        )),
    };

    let saw_error = match outcome {
        Ok(saw) => saw,
        Err(msg) => {
            let _ = child.kill().await;
            return Err(msg);
        }
    };

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let stderr_text = stderr_task.await.unwrap_or_default();
    if !status.success() && !saw_error {
        let t = tail(&stderr_text, 5);
        return Err(if t.is_empty() {
            tr(
                format!("The CLI exited with an error ({status})."),
                format!("El CLI terminó con error ({status})."),
            )
        } else {
            t
        });
    }
    Ok(())
}

#[cfg(test)]
mod tail_tests {
    use super::tail;

    #[test]
    fn prefers_error_line_and_drops_backtrace() {
        let s = "warn: algo\nError: Unknown feature flag: foo\n\nStack backtrace:\n   0: <unknown>\n   1: <unknown>\n";
        assert_eq!(tail(s, 5), "Error: Unknown feature flag: foo");
    }

    #[test]
    fn falls_back_to_last_lines() {
        assert_eq!(tail("a\nb\n\nc\n", 2), "b\nc");
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn parse_echo(line: &str) -> Vec<Parsed> {
        if line == "PROHIBIDO" {
            return vec![Parsed::Abort("intentó ejecutar un comando".into())];
        }
        vec![Parsed::Event(ChatEvent::Delta {
            text: line.to_string(),
        })]
    }

    fn opts<'a>(dir: &'a Path, stdin: &'a str) -> StreamOptions<'a> {
        StreamOptions {
            workdir: dir,
            stdin,
            timeout: Duration::from_secs(10),
            cancel: None,
        }
    }

    fn sh(script: &str) -> Vec<String> {
        vec!["-c".to_string(), script.to_string()]
    }

    async fn run_sh(script: &str, o: StreamOptions<'_>) -> (Result<(), String>, Vec<ChatEvent>) {
        let events = Mutex::new(Vec::new());
        let send = |ev: ChatEvent| events.lock().unwrap().push(ev);
        let r = stream(Path::new("/bin/sh"), &sh(script), o, parse_echo, &send).await;
        (r, events.into_inner().unwrap())
    }

    #[tokio::test]
    async fn streams_stdout_lines_and_passes_stdin() {
        let dir = std::env::temp_dir();
        let (r, ev) = run_sh("cat; echo fin", opts(&dir, "hola\n")).await;
        r.unwrap();
        assert_eq!(
            ev,
            vec![
                ChatEvent::Delta {
                    text: "hola".into()
                },
                ChatEvent::Delta { text: "fin".into() },
            ]
        );
    }

    #[tokio::test]
    async fn failure_reports_stderr_tail() {
        let dir = std::env::temp_dir();
        let (r, _) = run_sh("echo 'sin sesion' >&2; exit 3", opts(&dir, "")).await;
        assert_eq!(r.unwrap_err(), "sin sesion");
    }

    #[tokio::test]
    async fn exits_without_reading_big_stdin_keeps_stderr() {
        let dir = std::env::temp_dir();
        let big = "x".repeat(1 << 20);
        let (r, _) = run_sh("echo 'unknown option --foo' >&2; exit 2", opts(&dir, &big)).await;
        assert_eq!(r.unwrap_err(), "unknown option --foo");
    }

    #[tokio::test]
    async fn timeout_kills_process() {
        let dir = std::env::temp_dir();
        let mut o = opts(&dir, "");
        o.timeout = Duration::from_millis(200);
        let (r, _) = run_sh("sleep 30", o).await;
        assert!(r.unwrap_err().contains("took more than"));
    }

    #[tokio::test]
    async fn cancel_stops_process() {
        let dir = std::env::temp_dir();
        let (tx, rx) = oneshot::channel();
        let mut o = opts(&dir, "");
        o.cancel = Some(rx);
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            let _ = tx.send(());
        });
        let (r, _) = run_sh("sleep 30", o).await;
        assert_eq!(r.unwrap_err(), "Request stopped.");
    }

    #[tokio::test]
    async fn abort_from_parser_kills_process() {
        let dir = std::env::temp_dir();
        let (r, _) = run_sh("echo PROHIBIDO; sleep 30", opts(&dir, "")).await;
        assert!(r.unwrap_err().contains("comando"));
    }

    #[tokio::test]
    async fn invalid_utf8_does_not_break_stream() {
        let dir = std::env::temp_dir();
        let (r, ev) = run_sh("printf 'a\\377b\\nok\\n'", opts(&dir, "")).await;
        r.unwrap();
        assert_eq!(ev.len(), 2);
    }
}
