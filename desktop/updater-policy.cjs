const { reconstruct } = require('./distribution/delta.cjs');

// The inherited NSIS downloader performs a full request only when this method
// returns true. A failed/oversized delta must first receive explicit consent.
function incrementalUpdater(
  Base,
  {
    confirmFull = async () => false,
    reconstructUpdate = reconstruct,
    log = () => {},
  } = {},
) {
  return class extends Base {
    async differentialDownloadInstaller(fileInfo, options, destination) {
      const info = options.updateInfoAndProvider.info;
      try {
        const file = `kimo-Setup-${info.version}.exe`;
        const proof = await reconstructUpdate({
          manifest: {
            version: info.version,
            file,
            bytes: fileInfo.info.size,
            sha512: fileInfo.info.sha512,
            primary: `https://downloads.getkimo.tech/desktop/v${info.version}/${file}`,
          },
          resources: process.resourcesPath,
          fromVersion: this.app.version,
          cacheDir: this.downloadedUpdateHelper.cacheDir,
          output: destination,
          signal: AbortSignal.timeout(240000),
          onProgress: (p) =>
            this.emit('download-progress', {
              total: p.total,
              transferred: p.downloaded,
              percent: p.total ? (p.downloaded / p.total) * 100 : 100,
              bytesPerSecond: 0,
            }),
        });
        log(
          `incremental update: ${proof.networkBytes} network bytes, ${proof.reusedBytes} reused bytes`,
        );
        return false;
      } catch (error) {
        log(`incremental update unavailable: ${error.message}`);
        if (
          await confirmFull({
            version: info.version,
            bytes: fileInfo.info.size,
          })
        )
          return true;
        throw new Error(
          'Full update postponed; the installed app is unchanged',
        );
      }
    }
  };
}
module.exports = { incrementalUpdater };
