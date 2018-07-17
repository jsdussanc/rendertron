/*
 * Created by github.com/jsdussanc/ (cubidesjuan@gmail.com) 17/07/2018
 * Adaptation of Google Chrome cache code rendertron
 * These code makes the cache in ram memory, in small servers it may be necessary to perform the cache for a lijera database such as Redis or SqlLite
 */

'use strict';

const mCache = require('memory-cache');

class CacheMemory {
  async clearCache() {
    console.log(`Removing ${mCache.size()} items from the cache, on memSize: ${mCache.memsize()}`);
    mCache.clear();
  }

  async cacheContent(key, headers, payload) {
    // Set cache length to 15 days.
    const cacheDurationMinutes = 60 * 24 * 15;
    const now = new Date();
    const entity = {
      key: key,
      data: {
        'saved': now,
        'expires': new Date(now.getTime() + cacheDurationMinutes * 60 * 1000),
        'headers': JSON.stringify(headers), excludeFromIndexes: true,
        'payload': JSON.stringify(payload), excludeFromIndexes: true,
      }
    };
    mCache.put(entity.key, entity.data, cacheDurationMinutes * 60 * 1000, function (key, value) {
      console.log("mCache: " + key + " errased");
    }); // Time in ms
    console.log("mCache: " + key + " saved");
    //console.log(mCache.keys());

  }

  /**
   * Returns middleware function.
   * @return {function}
   */
  middleware() {
    return async function (request, response, next) {
      function accumulateContent(content) {
        if (typeof (content) === 'string') {
          body = body || '' + content;
        } else if (Buffer.isBuffer(content)) {
          if (!body)
            body = new Buffer(0);
          body = Buffer.concat([body, content], body.length + content.length);
        }
      }

      // Cache based on full URL. This means requests with different params are
      // cached separately.
      const key = request.url;
      const results = mCache.get(key);

      // Serve cached content if exists or its not expired.
      if (results) {
        const headers = JSON.parse(results.headers);
        response.set(headers);
        response.set('x-rendertron-cached', results.saved.toUTCString());
        let payload = JSON.parse(results.payload);
        if (payload && typeof (payload) == 'object' && payload.type == 'Buffer')
          payload = new Buffer(payload);
        response.send(payload);
        return;
      }

      // Capture output to cache.
      const methods = {
        write: response.write,
        end: response.end,
      };
      let body = null;

      response.write = function (content, ...args) {
        accumulateContent(content);
        return methods.write.apply(response, [content].concat(args));
      };

      response.end = async function (content, ...args) {


        if (response.statusCode == 200 || response.statusCode == 304) {
          accumulateContent(content);
          await this.cacheContent(key, response.getHeaders(), body);
        } else {
          console.log("No cached: response.statusCode", response.statusCode);
        }
        return methods.end.apply(response, [content].concat(args));
      }.bind(this);

      next();
    }.bind(this);
  }
}

// TODO(samli): Allow for caching options, like freshness options.
module.exports = new CacheMemory();
