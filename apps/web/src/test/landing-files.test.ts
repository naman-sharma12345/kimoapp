import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  validateFiles,
} from '../lib/landing-files';

function file(name: string, size = 1, type = '') {
  const result = new File(['x'], name, { type });
  Object.defineProperty(result, 'size', { value: size });
  return result;
}

describe('landing attachment validation', () => {
  it('accepts supported files and the exact individual limit', () => {
    const files = [
      file('movie.mp4', MAX_FILE_BYTES, 'video/mp4'),
      file('notes.md'),
    ];
    expect(validateFiles([], files).accepted).toEqual(files);
  });
  it('rejects unsupported types, oversized files, and more than 30 files', () => {
    const existing = Array.from({ length: 30 }, (_, index) =>
      file(`${index}.txt`),
    );
    expect(validateFiles([], [file('bad.exe')]).rejected[0]?.reason).toBe(
      'that file type isn’t supported yet',
    );
    expect(
      validateFiles([], [file('large.txt', MAX_FILE_BYTES + 1)]).rejected[0]
        ?.reason,
    ).toBe('it’s over 2 GB');
    expect(
      validateFiles(existing, [file('extra.txt')]).rejected[0]?.reason,
    ).toBe('you can add up to 30 files');
  });
  it('accounts for accepted files and existing files against the total limit', () => {
    const existing = [
      file('one.txt', MAX_FILE_BYTES),
      file('two.txt', MAX_FILE_BYTES),
    ];
    const accepted = file('three.txt', MAX_TOTAL_BYTES - 2 * MAX_FILE_BYTES);
    const rejected = file('four.txt');
    const result = validateFiles(existing, [accepted, rejected]);
    expect(result.accepted).toEqual([accepted]);
    expect(result.rejected[0]?.reason).toBe('your files total more than 5 GB');
  });
});
