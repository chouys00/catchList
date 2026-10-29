import path from "node:path";
import { commitGameFiles, readOptional } from "./manual-games.js";

export const GAME_NOTES_FILE = ".catchlist-game-notes.json";
export const MAX_GAME_NOTE_LENGTH = 300;

export function readGameNotes(dataDir) {
  const raw = readOptional(path.join(dataDir, GAME_NOTES_FILE));
  if (raw == null) return {};
  try {
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !data.notes || Array.isArray(data.notes) || typeof data.notes !== "object"
      || Object.entries(data.notes).some(([id, note]) => !/^[1-9]\d*$/.test(id) || typeof note !== "string" || note.length > MAX_GAME_NOTE_LENGTH)) throw new Error();
    return data.notes;
  } catch { throw new Error("遊戲備註檔格式不正確，原始備註尚未改動"); }
}

export function saveGameNote(dataDir, appid, text) {
  if (!/^[1-9]\d*$/.test(String(appid)) || typeof text !== "string" || text.length > MAX_GAME_NOTE_LENGTH) throw new Error("備註格式不正確，最多 300 字");
  const notes = readGameNotes(dataDir);
  const note = text.replace(/\r\n?/g, "\n").trim();
  if (note) notes[String(appid)] = note;
  else delete notes[String(appid)];
  commitGameFiles(dataDir, [{ name: GAME_NOTES_FILE, before: readOptional(path.join(dataDir, GAME_NOTES_FILE)), after: JSON.stringify({ version: 1, notes }, null, 2) + "\n" }]);
}
