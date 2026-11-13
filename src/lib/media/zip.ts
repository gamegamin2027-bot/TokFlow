import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { once } from "node:events";
import { crc32 } from "node:zlib";

/**
 * Écriture d'une archive ZIP sans dépendance externe.
 * Les fichiers sont rangés tels quels (méthode « stored ») : des MP4 sont déjà compressés,
 * les recompresser coûterait du processeur pour un gain nul. Noms en UTF-8 (accents conservés).
 */
export type ZipEntry = { name: string; path: string };

const MAX_ZIP32 = 0xffffffff;

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

async function fileCrc(path: string): Promise<number> {
  let crc = 0;
  for await (const chunk of createReadStream(path)) crc = crc32(chunk as Buffer, crc);
  return crc >>> 0;
}

export async function writeZip(output: string, entries: ZipEntry[]): Promise<number> {
  const out = createWriteStream(output);
  const failed = new Promise<never>((_, reject) => out.once("error", reject));
  const write = async (buf: Buffer) => {
    if (!out.write(buf)) await Promise.race([once(out, "drain"), failed]);
  };
  const { time, date } = dosDateTime(new Date());
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/[\\/]+/g, "_"), "utf8");
    const { size } = await stat(entry.path);
    const crc = await fileCrc(entry.path);
    if (size > MAX_ZIP32 || offset + size > MAX_ZIP32) throw new Error("Archive trop volumineuse");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version requise
    local.writeUInt16LE(0x0800, 6); // noms en UTF-8
    local.writeUInt16LE(0, 8); // méthode : stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    await write(Buffer.concat([local, name]));
    for await (const chunk of createReadStream(entry.path)) await write(chunk as Buffer);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(size, 20);
    head.writeUInt32LE(size, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([head, name]));
    offset += 30 + name.length + size;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  await write(directory);
  await write(end);
  out.end();
  await Promise.race([once(out, "finish"), failed]);
  return offset + directory.length + 22;
}
