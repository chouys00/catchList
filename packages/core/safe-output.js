import fs from "node:fs";
import path from "node:path";

const UNSAFE_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;

export function sanitizeDisplayText(value, { maxLength = 300 } = {}) {
  const normalized = String(value ?? "")
    .replace(UNSAFE_CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.slice(0, maxLength);
}

export function atomicWriteFile(filepath, content, encoding = "utf8") {
  const dir = path.dirname(path.resolve(filepath));
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.${path.basename(filepath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(tempPath, content, encoding);
    fs.renameSync(tempPath, filepath);
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}
