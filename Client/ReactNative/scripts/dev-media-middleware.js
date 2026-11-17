// Development only: lets the Metro dev server also serve the test videos in ./dev-media at
// /dev-media/<name>.mp4, so a phone reaches them through the same URL (or tunnel) it already
// uses for the JavaScript bundle. Supports HTTP Range requests, which video seeking needs.
// Never part of a release build: Metro itself is not shipped.
const fs = require('fs');
const path = require('path');

const PREFIX = '/dev-media/';

function serveDevMedia(directory) {
  return (req, res, passThrough) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith(PREFIX) || (req.method !== 'GET' && req.method !== 'HEAD')) {
      return passThrough();
    }

    // basename() drops any directory part, so "../" tricks cannot leave the folder.
    let name;
    try {
      name = path.basename(decodeURIComponent(url.slice(PREFIX.length)));
    } catch {
      res.statusCode = 400;
      return res.end('bad request');
    }
    if (!name.endsWith('.mp4')) {
      res.statusCode = 404;
      return res.end('not found');
    }

    const file = path.join(directory, name);
    fs.stat(file, (error, stat) => {
      if (error || !stat.isFile()) {
        res.statusCode = 404;
        return res.end('not found');
      }

      const size = stat.size;
      let start = 0;
      let end = size - 1;
      let status = 200;

      const header = req.headers.range;
      if (header) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(header);
        if (!match || (match[1] === '' && match[2] === '')) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.end();
        }
        if (match[1] === '') {
          // "bytes=-500": the last 500 bytes
          start = Math.max(0, size - Number(match[2]));
        } else {
          start = Number(match[1]);
          if (match[2] !== '') end = Math.min(Number(match[2]), size - 1);
        }
        if (start >= size || start > end) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${size}`);
          return res.end();
        }
        status = 206;
      }

      res.statusCode = status;
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', String(end - start + 1));
      res.setHeader('Cache-Control', 'no-cache');
      if (status === 206) {
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      }
      if (req.method === 'HEAD') {
        return res.end();
      }
      fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    });
  };
}

/** Wraps Metro's middleware so /dev-media/* is answered here and everything else is untouched. */
function enhanceMiddleware(directory) {
  const serve = serveDevMedia(directory);
  return (metroMiddleware) => (req, res, next) =>
    serve(req, res, () => metroMiddleware(req, res, next));
}

module.exports = { enhanceMiddleware, serveDevMedia };
