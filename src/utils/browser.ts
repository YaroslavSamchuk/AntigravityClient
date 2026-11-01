import { exec } from 'node:child_process';
import os from 'node:os';

export function openBrowser(url: string): void {
  const platform = os.platform();

  let command = '';
  if (platform === 'win32') {
    // Windows: start "" "url"
    command = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    // macOS
    command = `open "${url}"`;
  } else {
    // Linux and others
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.warn(`Не вдалося автоматично відкрити браузер: ${err.message}`);
      console.info(`Будь ласка, відкрийте це посилання вручну:\n${url}`);
    }
  });
}
