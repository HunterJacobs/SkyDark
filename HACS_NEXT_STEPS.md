# HACS Default Store – Next Steps

All required files for HACS submission are in place. Complete these steps to get listed in the default HACS store.

## 0. Fix repository description and topics (required for HACS Action)

The HACS Action fails if the repo has no **description** or **topics**. Do this first:

1. On GitHub: open your repo → click the **About** (gear icon) next to the description.
2. **Description**: set a short summary, e.g.  
   `Skydark Family Calendar – calendar, chores, lists, meals, and more for Home Assistant`
3. **Topics**: add at least one; for example:
   - `home-assistant`
   - `hacs`
   - `home-assistant-integration`
   - `calendar`
4. Save.

## 1. Push to GitHub and verify Actions

1. Commit and push the new files:
   - `hacs.json`
   - `.github/workflows/hacs.yaml`
   - `.github/workflows/hassfest.yaml`
   - `custom_components/skydark_calendar/brand/icon.png`
   - `info.md` (at repository root — used as the HACS store description)

2. On GitHub: **Actions** tab → confirm both workflows run and pass:
   - **HACS Action**
   - **Validate with hassfest**

3. If either fails, fix the reported issues and push again.

## 2. Create a GitHub release

1. **Releases** → **Create a new release**.
2. **Choose a tag**: create tag `v1.0.0`.
3. **Release title**: e.g. `v1.0.0` or `Skydark Family Calendar 1.0.0`.
4. **Describe this release**: short summary of features (e.g. from README).
5. **Set as latest release**.
6. Click **Publish release**.

Only full **releases** count for HACS, not tags alone.

## 3. Submit to HACS default store

1. Fork **https://github.com/hacs/default**.
2. Clone your fork and create a **new branch from `master`** (e.g. `add-skydark`).
3. Open the **`integration`** file (root of the repo). It is a JSON array of `"owner/repo"` strings, sorted **alphabetically**.
4. Add: `"HunterJacobs/SkyDark"` in the correct alphabetical position (under the `"H"` entries).
5. Commit, push the branch, and open a **Pull Request** to `hacs/default` `master`.
6. Fill out the PR template (owner, repo, category: Integration, etc.).
7. Wait for all automated checks to pass and for HACS maintainer review (review can take a long time).

After the PR is merged, your integration will appear in the next HACS store scan (typically within 24 hours).
