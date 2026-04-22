# Rotating leaked secrets

Until now, some dashboard JSON files (`rpi/dashboard/dashboards/*.json`)
contained live credentials — a Home Assistant long-lived token, a Spotify
client secret, and a Spotify refresh token. The code has been migrated
to read these from the gitignored `credentials.json` at runtime, and the
tracked JSONs have been scrubbed.

But the old values still exist in git history. Anyone who ever cloned
this repo at any commit prior to `<this commit>` has a copy. The commits
are also visible on GitHub.

To close out this security issue fully you need to both **rewrite history**
and **rotate the exposed credentials**. If you only do one, the other is
still compromised.

---

## Step 1 — rotate the exposed credentials

Do these FIRST, before the history rewrite, so a leak-to-rewrite race doesn't
leave the old tokens valid anywhere.

### Home Assistant long-lived token

1. Open HA → bottom-left profile icon → Security tab.
2. Scroll to **Long-Lived Access Tokens**. Find the token that leaked
   (the one named for the dashboard — possibly `grumpy-dashboard` or
   `default`). Click the trash icon to **delete** it.
3. Create a new token. Name it descriptively, e.g. `grumpy-dashboard`.
4. Copy the new token.
5. In the Dashboard Manager (`/manage` route), open **Shared Credentials
   → Home Assistant** and paste the new token. Save.
6. Test — load the dashboard with the existing device, verify HA-backed
   widgets still work.

### Spotify client secret + refresh token

1. Go to <https://developer.spotify.com/dashboard>.
2. Find your app (client ID `a864f77d…`). Open it.
3. **Settings → Client secret → Rotate client secret**. Copy the new
   value.
4. The refresh token tied to the old secret is now worthless. You need
   to re-authorize Spotify for the dashboard.
5. In the Dashboard Manager, open **Shared Credentials → Spotify**:
   - Paste the new client secret.
   - Click the authorization flow to obtain a new refresh token. Save.
6. Test — play something via the Music widget.

---

## Step 2 — rewrite git history

This removes the old secrets from every commit so they no longer show up
in `git log`, blame, or GitHub's web UI. **Destructive** — all clones of
the repo become inconsistent with the rewritten remote and must re-clone.

Preferred tool is [`git filter-repo`](https://github.com/newren/git-filter-repo)
(faster and safer than `filter-branch`). Install with `pipx install git-filter-repo`
or `apt install git-filter-repo`.

### Dry-run the rewrite

Run from the repo root:

```bash
# Save the exact strings you want scrubbed to a file. Only list ones that
# appear in the leaked JSONs — not the new (rotated) values.
cat > /tmp/grumpy-secrets.txt <<'EOF'
literal:REDACTED_HA_LONG_LIVED_TOKEN==>REDACTED_HA_TOKEN
literal:REDACTED_SPOTIFY_CLIENT_SECRET==>REDACTED_SPOTIFY_CLIENT_SECRET
literal:REDACTED_SPOTIFY_REFRESH_TOKEN==>REDACTED_SPOTIFY_REFRESH_TOKEN
EOF

# Preview what would change, without writing. Good for confidence.
git filter-repo --replace-text /tmp/grumpy-secrets.txt --dry-run
```

### Execute the rewrite

```bash
# Back up first (filter-repo refuses to run on dirty trees).
cd ..
cp -r grumpy grumpy.backup-$(date +%Y%m%d-%H%M%S)
cd grumpy

git filter-repo --replace-text /tmp/grumpy-secrets.txt
```

This rewrites every commit. Branches and tags still point to the new
commit IDs; the old ones are reachable only via `.git/packed-refs`
backups, which `filter-repo` keeps for you briefly.

### Force-push

```bash
# Confirm the rewrite looks right.
git log --all --oneline | head -20
grep -rE 'eyJhbGciOiJIUzI1NiI|REDACTED_SPOTIFY_CLIENT_SECRET' $(git rev-list --all) 2>/dev/null | head
# (that grep should produce nothing)

# Push. This requires --force-with-lease on every branch.
git push --force-with-lease --all origin
git push --force-with-lease --tags origin
```

### Clean up GitHub side

1. After force-pushing, GitHub still keeps the old commits accessible via
   direct SHA for a while. **Open an "Unused refs" cleanup** via the
   GitHub support page or contact form — or just wait ~90 days for
   garbage collection.
2. If the repo is public, the old SHAs may still be visible through
   forks, search caches, or archive.org. Credential rotation is your
   real protection; the rewrite is cosmetic.

### Tell any collaborators to re-clone

```
Repo history was rewritten on <date>. Local clones are no longer
compatible. Please:
  cd .. && rm -rf grumpy && git clone git@github.com:jsetsuda/grumpy_project.git grumpy
```

---

## Verification

After both steps:

- `git log -p | grep -iE 'eyJhbGciOi|0a422dce|AQBIM2pz' | head` — should
  produce no output.
- Trying the old HA token against `http://192.168.2.94:8123/api/` should
  return 401.
- Trying the old Spotify refresh token at `accounts.spotify.com/api/token`
  should return `invalid_grant`.

If all three are true, the old credentials are dead and gone.
