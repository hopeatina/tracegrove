# November 26, 2026 adoption run

All 29 healthy runs passed independent bundle verification. All 25 static sites rejected an HTTP-200 maintenance page with the wrong title. Twenty repositories also had a project-specific check. Nine had only page-delivery and title coverage.

On fresh checkouts of the same 25 browser repositories, the previous merged CLI (7474ccc) produced zero passing runs with plain `init` followed by `test`. The new CLI produced 12. Selecting the actual page, building assets or specifying the runtime title brought all 25 through the configured path. This is an onboarding completion count, not a timing or productivity estimate.

| Pinned upstream | Old default | New default | Verified coverage |
| --- | --- | --- | --- |
| [gabrielecirulli/2048](https://github.com/gabrielecirulli/2048/tree/478b6ec346e3787f589e4af751378d06ded4cbbc) | Blocked | Pass | Page navigation and exact document title |
| [jakesgordon/javascript-tetris](https://github.com/jakesgordon/javascript-tetris/tree/e5c0c42f7dac0f3514a55eff656c6e22e95d68ed) | Blocked | Pass | Start the game and read its opening row count |
| [jakesgordon/javascript-breakout](https://github.com/jakesgordon/javascript-breakout/tree/eed59e2affa9423b93d2ac8ff93061bb88b33284) | Blocked | Pass | Advance the level, refresh and read the persisted choice |
| [hextris/hextris](https://github.com/hextris/hextris/tree/3f4847dc8fd7dab3d1c87e6324b9159d92fbd396) | Blocked | Pass | Page navigation and exact document title |
| [doublespeakgames/adarkroom](https://github.com/doublespeakgames/adarkroom/tree/1fada4620b6c66bd07bf15a3f1eb8223df8bc1d7) | Blocked | Setup needed | Light the fire and reveal the stoke control |
| [jbt/markdown-editor](https://github.com/jbt/markdown-editor/tree/58aa8bfe18c5a30af2c6fb08221b00b841688dd9) | Blocked | Title differs | Read the rendered heading in the live Markdown preview |
| [SortableJS/Sortable](https://github.com/SortableJS/Sortable/tree/48b626bbc61afbb0f179730c1dd3cca3dcc8b788) | Failed | Setup needed | Page navigation and exact document title |
| [CodeSeven/toastr](https://github.com/CodeSeven/toastr/tree/50092cc604850a16c985520b63df184d3e0b4086) | Failed | Pass | Show a toast and read the rendered message |
| [LeaVerou/prefixfree](https://github.com/LeaVerou/prefixfree/tree/cf4c0051cf54f353c1473b6a7733e931e51f8176) | Blocked | Pass | Open the FAQ and read its heading |
| [LeaVerou/cubic-bezier](https://github.com/LeaVerou/cubic-bezier/tree/a95f0a4674ef56eb760e0413276dc13d9a70f2fa) | Blocked | Title differs | Open a bookmarked curve and read its four coordinates |
| [LeaVerou/css3patterns](https://github.com/LeaVerou/css3patterns/tree/98adf4d231ee9f50be2b9713cbb210606385732f) | Blocked | Pass | Expand the Carbon fibre pattern and read the revealed credit |
| [LeaVerou/bliss](https://github.com/LeaVerou/bliss/tree/497bd7b9c21774e5c154209a45d8ceb168715e03) | Failed | Setup needed | Page navigation and exact document title |
| [bgrins/spectrum](https://github.com/bgrins/spectrum/tree/101b05c1d977fbc529ae4c3b6865b1f7ab70c6e0) | Failed | Pass | Set a color and read the value of the separate original input |
| [jackmoore/colorbox](https://github.com/jackmoore/colorbox/tree/d6490ea29cfe6ce80908011b52d5aff58114facc) | Failed | Setup needed | Open the inline dialog and read its close control |
| [jackmoore/zoom](https://github.com/jackmoore/zoom/tree/13eed6ebaf8976ede2f32258acf9086d26ed5a78) | Failed | Pass | Page navigation and exact document title |
| [jackmoore/autosize](https://github.com/jackmoore/autosize/tree/1e0229b9bb9f51c2b6a2756d901a023b475fa950) | Failed | Pass | Page navigation and exact document title |
| [lonekorean/highlight-within-textarea](https://github.com/lonekorean/highlight-within-textarea/tree/8e16e3acea7af5733c6a3b671194199327e0a8b2) | Failed | Pass | Page navigation and exact document title |
| [zenorocha/clipboard.js](https://github.com/zenorocha/clipboard.js/tree/899378dee9681dcf4cb3d702c23a3f3cd9f473d8) | Failed | Setup needed | Enter a number and invoke the clipboard control |
| [jquery/jquery-ui](https://github.com/jquery/jquery-ui/tree/dcf10556bbcfdf3e10e3ea30966482e201191411) | Blocked | Pass | Follow the accordion example link and check the destination |
| [bigskysoftware/htmx](https://github.com/bigskysoftware/htmx/tree/51c3e67bcedc5568b2a968b079888f13aedf4eb7) | Failed | Setup needed | Replace the body with the response to a button click |
| [fengyuanchen/viewerjs](https://github.com/fengyuanchen/viewerjs/tree/b6ddf87b94b9e466409aa955e2991f99a84c5d7c) | Blocked | Setup needed | Follow the custom-title example link and check the destination |
| [josdejong/jsoneditor](https://github.com/josdejong/jsoneditor/tree/85dfeee8129f2a47ca67d8475327f9e3716797d5) | Blocked | Setup needed | Switch the actual editor from tree to form mode |
| [josdejong/mathjs](https://github.com/josdejong/mathjs/tree/0f5c9095c38db71180a175990c73407db4a0db70) | Blocked | Setup needed | Evaluate an edited arithmetic expression in the code editor |
| [jeresig/jquery.hotkeys](https://github.com/jeresig/jquery.hotkeys/tree/f24f1da275aab7881ab501055c256add6f690de4) | Failed | Setup needed | Page navigation and exact document title |
| [niklasvh/html2canvas](https://github.com/niklasvh/html2canvas/tree/6020386bbeed60ad68e675fdcaa6220e292fd35a) | Blocked | Setup needed | Page navigation and exact document title |
| [pallets/flask](https://github.com/pallets/flask/tree/49943b5a94413a530761350f04e896f76e8d620e) | — | — | Submit two numbers and observe the server sum in the browser |
| [fastapi/fastapi](https://github.com/fastapi/fastapi/tree/05e6df7e906c3decba377c37548019973f40bf15) | — | — | PATCH one field and independently read the price and preserved name |
| [postmanlabs/httpbin](https://github.com/postmanlabs/httpbin/tree/2c4572bb82727dca9f9fe56b835d2232bc15d531) | — | — | Observe the method and structured payload echoed by the live service |
| [expressjs/express](https://github.com/expressjs/express/tree/43fca52d28a422c8be48fd489cbd4f2d6152bab6) | — | — | Delete a user from the example service and independently read its removal |

## Additional controls

- FastAPI returned success after an instrumented dropped write. The independent GET read the old price, 50.2, against the expected 73. The named fault proof verified.
- The Flask calculator returned 43 for 19 + 23 when its local fault switch was enabled. The healthy browser read 42. The named fault proof verified.
- The Breakout recorder captured level 1, clicked the next-level control and read level 2. Fresh replay and a separate verification passed. Changing only that recorded workflow selected one of two cases. Its result agreed with the full reference run, with zero missed failing cases.

## Reproduction details

The local browser run used Node 22.22.2, Playwright 1.64.1, Chromium 158.0.8127.0 and system ffmpeg 7.1.5. The browser and encoder were local substitutes for the Playwright download. Build preparation is included in the case manifest. The browser checks do not allow arbitrary network access. Spectrum’s two missing optional icon sheets and any excluded external origins are listed per case.

The [machine-readable results](results.json) identify each case, assertion, source digest and evidence manifest. The runner retains full bundles under the work directory for independent re-verification.
