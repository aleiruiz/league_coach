use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;

use super::ChatEvent;

/// Busca el ejecutable en el PATH (en Windows también encuentra `.cmd`/`.exe`).
pub fn resolve(binary: &str) -> Option<PathBuf> {
    which::which(binary).ok()
}

pub struct Output {
    pub status_ok: bool,
    pub stdout: String,
    pub stderr: String,
}

fn command(bin: &Path) -> Command {
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

/// Ejecuta el CLI, le pasa el prompt por stdin y va emitiendo eventos por
/// cada línea JSON de su salida.
pub async fn stream(
    bin: &Path,
    args: &[String],
    workdir: &Path,
    stdin_text: &str,
    parse: fn(&str) -> Vec<ChatEvent>,
    send: &(dyn Fn(ChatEvent) + Send + Sync),
) -> Result<(), String> {
    let mut child = command(bin)
        .args(args)
        .current_dir(workdir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No pude ejecutar {}: {e}", bin.display()))?;

    let mut stdin = child.stdin.take().expect("stdin piped");
    stdin
        .write_all(stdin_text.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    drop(stdin);

    let mut stderr = child.stderr.take().expect("stderr piped");
    let stderr_task = tokio::spawn(async move {
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf).await;
        buf
    });

    let mut saw_error = false;
    let mut lines = BufReader::new(child.stdout.take().expect("stdout piped")).lines();
    while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
        for ev in parse(&line) {
            saw_error |= matches!(ev, ChatEvent::Error { .. });
            send(ev);
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let stderr_text = stderr_task.await.unwrap_or_default();
    if !status.success() && !saw_error {
        let tail: String = stderr_text
            .lines()
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join("\n");
        return Err(if tail.is_empty() {
            format!("El CLI terminó con error ({status}).")
        } else {
            tail
        });
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::sync::Mutex;

    fn parse_echo(line: &str) -> Vec<ChatEvent> {
        vec![ChatEvent::Delta {
            text: line.to_string(),
        }]
    }

    #[tokio::test]
    async fn streams_stdout_lines_and_passes_stdin() {
        let dir = std::env::temp_dir();
        let events = Mutex::new(Vec::new());
        let send = |ev: ChatEvent| events.lock().unwrap().push(ev);
        let args = vec!["-c".to_string(), "cat; echo fin".to_string()];
        stream(
            Path::new("/bin/sh"),
            &args,
            &dir,
            "hola\n",
            parse_echo,
            &send,
        )
        .await
        .unwrap();
        assert_eq!(
            events.into_inner().unwrap(),
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
        let send = |_: ChatEvent| {};
        let args = vec![
            "-c".to_string(),
            "echo 'sin sesion' >&2; exit 3".to_string(),
        ];
        let err = stream(Path::new("/bin/sh"), &args, &dir, "", parse_echo, &send)
            .await
            .unwrap_err();
        assert_eq!(err, "sin sesion");
    }
}
