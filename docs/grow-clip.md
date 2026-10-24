# The grow clip

`tracegrove clip` turns the last `tracegrove grow` into a short vertical video you can post:
the change grows from a seed into a bonsai, every drafted scenario buds as a pale leaf, and a
leaf turns green only where a real flow run passed. A failed scenario turns red and falls. Anything
that did not run stays pale, and the closing frame counts all three.

```sh
tracegrove grow            # read, trace, draft and prove the change on this branch
tracegrove clip            # record the newest grow log as a clip
tracegrove grow --record   # or both in one go
```

It writes to `.tracegrove/clips/<branch>/`:

| File | What it is |
| --- | --- |
| `grove.mp4` | 1080×1920, 30 fps, H.264, about 12 s. Ready for X, LinkedIn, TikTok and Shorts. |
| `grove.html` | A self-contained player that loops the same animation. |
| `grove.svg` | The finished tree, for a README or a slide. |
| `grove.png` | The last frame, for a preview image. |

Options:

- `--log <file>` records a specific grow log instead of the newest one in `.tracegrove/discovery/`.
- `--out <dir>` writes somewhere else.
- `--no-video` writes only the player and the SVG, with no browser needed.

The video needs Playwright's headless browser (`tracegrove setup browsers`) and an `ffmpeg` with
H.264 on `PATH` (or set `TRACEGROVE_FFMPEG`). Without that ffmpeg it records `grove.webm` in real time
instead and says so.

The clip is drawn from the saved `tracegrove.discovery-event/v1` events, folded with the same
`applyGrow` every other grow view uses, so it cannot show more than the run proved. Timing is fixed to
a storyboard (seed, trunk, limbs and roots, buds, results in the order they ran, the count), so a slow
run and a fast one make the same 12-second clip.
