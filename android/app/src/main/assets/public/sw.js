/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "7108b711be94156e0d329e60b44b5403"
  }, {
    "url": "pwa-512x512.png",
    "revision": "bef63602851d4a441d60b1c380bc4c14"
  }, {
    "url": "pwa-192x192.png",
    "revision": "77fc23cd5842c82387d329ae0b8096ef"
  }, {
    "url": "index.html",
    "revision": "c32521117478febd233cb291e451e516"
  }, {
    "url": "icon.svg",
    "revision": "5fe4a05b0afba61b38824f1e3d0e1666"
  }, {
    "url": "favicon.ico",
    "revision": "400cec9e7ba6c3c4f45dd3ffe000f46a"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "eb2f24d1082cd79af835d768e32ee77c"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/web-iN7LPILN.js",
    "revision": null
  }, {
    "url": "assets/web-DX9maK_T.js",
    "revision": null
  }, {
    "url": "assets/web-BpBfQ_qo.js",
    "revision": null
  }, {
    "url": "assets/purify.es-Dzkdzyfv.js",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-vietnamese-700-normal-CV6qDkkj.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-vietnamese-700-normal-BCh_uG_5.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-vietnamese-600-normal-Y4VTTRme.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-vietnamese-600-normal-5YsyKbU1.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-vietnamese-500-normal-DiU8zqi-.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-vietnamese-500-normal-CvE5C8T-.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-ext-700-normal-BajbvANd.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-ext-700-normal-8-d-IyIQ.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-ext-600-normal-DQgPU_Cg.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-ext-600-normal-B0WRRYJ1.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-ext-500-normal-CqEEAICU.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-ext-500-normal-9VZagAe1.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-700-normal-DqEcQeE5.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-700-normal-CfpNZvy6.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-600-normal-DLTa1BUW.woff2",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-600-normal-BR_Ojra4.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-500-normal-DYtqi0QS.woff",
    "revision": null
  }, {
    "url": "assets/plus-jakarta-sans-latin-500-normal-Bf-nb4oT.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-vietnamese-700-normal-BDLVIk2r.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-vietnamese-600-normal-OWROknRo.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-vietnamese-400-normal-CqNFfHCs.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-ext-700-normal-CxPITLHs.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-ext-700-normal-CZipNAKV.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-ext-600-normal-DObL3zCW.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-ext-600-normal-BfB_LPfz.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-ext-400-normal-fXTG6kC5.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-ext-400-normal-Bc8Ftmh3.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-700-normal-D3wTyLJW.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-700-normal-BYuf6tUa.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-600-normal-C8RAYTDA.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-600-normal-BfsvjouI.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-400-normal-V6pRDFza.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-latin-400-normal-6-qcROiO.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-greek-700-normal-DEigVDxa.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-greek-700-normal-C6CZE3T8.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-greek-600-normal-mc2nkWzM.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-greek-600-normal-H7WoG9Et.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-greek-400-normal-C190GLew.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-greek-400-normal-B9oWc5Lo.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-cyrillic-700-normal-CEoEElIJ.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-cyrillic-700-normal-BWTpRfYl.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-cyrillic-600-normal-EVf6-Yzo.woff2",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-cyrillic-600-normal-8K4wrrwR.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-cyrillic-400-normal-ugxPyKxw.woff",
    "revision": null
  }, {
    "url": "assets/jetbrains-mono-cyrillic-400-normal-BEIGL1Tu.woff2",
    "revision": null
  }, {
    "url": "assets/index.es-1rM0QwAc.js",
    "revision": null
  }, {
    "url": "assets/index-ub4B6T5b.js",
    "revision": null
  }, {
    "url": "assets/index-PwxhV6eV.css",
    "revision": null
  }, {
    "url": "assets/html2canvas-97RrDc0R.js",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-700-normal-DrXhL2wd.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-700-normal-AcGW2CvL.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-600-normal-Cohm2Dtr.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-600-normal-BE5fbvrE.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-500-normal-BzNTYs89.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-500-normal-BnuUACUj.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-400-normal-EIcpWxdl.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-ext-400-normal-BPdlAeTO.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-700-normal-z30-k5TQ.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-700-normal-DO_14aHP.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-600-normal-DHrLfb92.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-600-normal-Cgt-s7Wl.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-500-normal-S8HLIV69.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-500-normal-6-4w_u8d.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-400-normal-esES0U7a.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-latin-400-normal-B2m00w2e.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-700-normal-FVd7rFqZ.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-700-normal-CeVCCB8W.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-600-normal-D_VSXRuy.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-600-normal-DLZF4s8q.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-500-normal-UuhTmLlo.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-500-normal-CDy0O77J.woff",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-400-normal-rHQ7AW0H.woff2",
    "revision": null
  }, {
    "url": "assets/hind-siliguri-bengali-400-normal-qtENw2Fc.woff",
    "revision": null
  }, {
    "url": "assets/favicon-CB27oelX.ico",
    "revision": null
  }, {
    "url": "assets/aistudio/image_def0edfb.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_b8864610.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_7260d8e5.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_5ef2b423.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_5d65a848.png",
    "revision": null
  }, {
    "url": "assets/aistudio/image_2e8f5423.png",
    "revision": null
  }, {
    "url": "assets/aistudio/CashTrace_2c0be490.html",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "eb2f24d1082cd79af835d768e32ee77c"
  }, {
    "url": "favicon.ico",
    "revision": "400cec9e7ba6c3c4f45dd3ffe000f46a"
  }, {
    "url": "icon.svg",
    "revision": "5fe4a05b0afba61b38824f1e3d0e1666"
  }, {
    "url": "pwa-192x192.png",
    "revision": "77fc23cd5842c82387d329ae0b8096ef"
  }, {
    "url": "pwa-512x512.png",
    "revision": "bef63602851d4a441d60b1c380bc4c14"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "7108b711be94156e0d329e60b44b5403"
  }, {
    "url": "manifest.webmanifest",
    "revision": "d2d5f92a2de87a8c8705852589441dcd"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));

}));
