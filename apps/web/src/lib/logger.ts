/** Never log prompt text, file names, API responses or credentials. */
export const logger = {
  error(code: string) {
    if (process.env.NODE_ENV !== 'production') console.error(`[kimo] ${code}`);
  },
};
