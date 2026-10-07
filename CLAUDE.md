# Installing skills and plugins

Whenever the user asks to install a skill or plugin, install it persistently at project level and commit + push, so it works in every future session:

- Skills: `npx -y skills add <source> [--skill <name>] -y` from the repo root. Files land in `.agents/skills/<name>` and are symlinked into `.claude/skills/`. Review the files (scripts, downloads) before committing. Commit `.agents/`, `.claude/skills/`, and `skills-lock.json`.
- Plugins: `claude plugin install <plugin>@<marketplace> --scope project`. Make sure the marketplace is declared under `extraKnownMarketplaces` in `.claude/settings.json` so fresh sessions can resolve it. Commit `.claude/settings.json`.
- After every skill install or update, run `scripts/unlock-skills.sh`. It strips `disable-model-invocation` / `user-invocable` and "only when explicitly invoked" wording, so Claude uses every skill on its own whenever relevant, without the user invoking it.
- For use in claude.ai chat and Cowork, also package each skill folder as `outputs/skill-zips/<name>.zip` (folder at zip root, `SKILL.md` inside) and commit it; the user uploads these under Settings → Capabilities → Skills.
