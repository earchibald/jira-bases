export interface ExistsAdapter {
  exists(path: string): Promise<boolean>;
}

const MAX_DISAMBIGUATION_ATTEMPTS = 1000;

export function splitExtension(path: string): { stem: string; ext: string } {
  const lastSlash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  // Hidden dotfiles (dot is the first char of the basename) have no extension.
  if (dot <= lastSlash + 1 || dot === -1) {
    return { stem: path, ext: "" };
  }
  return { stem: path.slice(0, dot), ext: path.slice(dot) };
}

export async function nextAvailablePath(
  vault: ExistsAdapter,
  path: string,
): Promise<string> {
  if (!(await vault.exists(path))) return path;
  const { stem, ext } = splitExtension(path);
  for (let n = 1; n <= MAX_DISAMBIGUATION_ATTEMPTS; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await vault.exists(candidate))) return candidate;
  }
  throw new Error(
    `Could not find an available filename after ${MAX_DISAMBIGUATION_ATTEMPTS} attempts for ${path}`,
  );
}
