# Contributing to Visulaserz

Thanks for wanting to help. The quickest way in is a new scene: it is one file, it needs no build step, and once it is merged it appears in the scene market for everyone who uses the app and [visulaserz.com](https://visulaserz.com).

## Run it

```bash
npm start
```

Open <http://localhost:4777>. The app has no runtime dependencies; YouTube import needs `npm run setup` once (see the README), everything else works without it.

## Add a scene

Every scene is a plugin in `public/scenes/<id>.js` whose default export describes itself: `id`, `name`, `group` (Show, Journey, Vibe, Things or Lab), `blurb`, `tags`, `energy`, its trail settings and the `frag` shader. The README's "Scene guide" and "Make it yours" sections list the signals a shader can read and the optional `points` and `sim` extras.

1. Copy a scene close to what you have in mind, rename the file and its `id` (lowercase letters, digits and dashes), and rewrite `main()`. Add `author: { name: 'Your Name', url: 'https://github.com/you' }` to the export: your name is shown on the scene's market card and on its page at visulaserz.com, linked to the url (https only; leave `url` out for a plain name).
2. Try it without any tooling: download the template from the bottom of the market, or drop your `.glsl` file on the page. It compiles on the spot and errors come back with your own line numbers.
3. Run the lab and press **Check all**:

   ```bash
   node scripts/scene-lab.mjs <id>
   ```

   Open the printed URL in a WebGL2 browser. A scene passes when bass, mid and high each visibly change the picture, and silence leaves it still.
4. List it in the market and render its card picture:

   ```bash
   npm run catalog
   ```

   ```bash
   npm run thumbs -- <id>
   ```

5. Commit the scene file, `public/scenes/catalog.json` and `public/scenes/thumbs/<id>.webp` together.

What makes a scene feel at home here:

- **Tie elements to bands.** One lantern, balloon, tower or filament per frequency band, so you can see the music, not just a pulse. Say which in the comment at the top of the file.
- **Give the beat a visible event**, and finish it within one beat (about half a second): only the latest beat is known. Anything that lives longer runs on the time or travel clocks.
- **Scale to the screen.** The subject should cross a third of the frame or more, and a sphere has to fit inside it. Check it at 16:9 and on an upright phone.
- **Respect "Reduce flashing".** No full-screen white strobes when it is on.
- **Make it your own.** Original work only. Do not paste shaders from Shadertoy or elsewhere unless their license is compatible with the AGPL and you keep the credit.

## Bugs and other changes

- Open an issue first for anything bigger than a small fix, so we can agree on the shape before you spend the time.
- Keep a pull request to one change. Say what you tested and on which browser.
- Match the style of the file you are in: plain modern JavaScript modules, no frameworks, comments that explain why.
- Tests that apply: `node scripts/test-hosting.js`, `node scripts/test-admin.js` and `npm run test:production` for server changes; the scene lab for anything that draws.

## AI tools

Visulaserz itself is built with help from AI coding tools, so they are welcome here too, on two conditions: you have run and looked at the result yourself, and you say in the pull request which tool you used and for what. You are answerable for every line you submit.

## Security

Please do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the [GNU AGPL v3.0 or later](LICENSE), the same as the rest of the project.
