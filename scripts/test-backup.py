"""Verify backups include only explicitly permanent users' audio, and survive files the server
deletes while the archive is being written. Written for Linux; elsewhere the lock is stubbed."""
import os
from pathlib import Path
import sqlite3
import sys
import tarfile
import tempfile
import types

try:
    import fcntl  # noqa: F401  (backup.py locks its directory with it)
except ImportError:
    sys.modules['fcntl'] = types.SimpleNamespace(LOCK_EX=2, LOCK_NB=4, flock=lambda *args: None)

source = (Path(__file__).resolve().parent.parent / 'deploy/backup.py').read_text()
with tempfile.TemporaryDirectory(prefix='visulaserz-backup-test-') as temporary:
    root = Path(temporary)
    (root / 'data').mkdir()
    (root / 'current').mkdir()
    (root / 'current/server.js').write_text('// fixture')
    (root / 'secrets').mkdir()
    (root / 'secrets/tunnel-token').write_text('test-only')
    with sqlite3.connect(root / 'data/accounts.sqlite') as db:
        db.execute('CREATE TABLE audio_policies(user_id TEXT PRIMARY KEY, keep_audio INTEGER)')
        db.execute("INSERT INTO audio_policies VALUES('permanent',1)")
    db.close()
    for user in ('permanent', 'temporary'):
        directory = root / 'data/cache/users' / user
        directory.mkdir(parents=True)
        for extension in ('mp3', 'jpg', 'json', 'webm.part'):
            (directory / f'AAAAAAAAAAA.{extension}').write_text('fixture')
    # The lease cleaner removes a temporary MP3 after the walk listed it but before it is read.
    vanishing = root / 'data/cache/users/temporary/BBBBBBBBBBB.mp3'
    vanishing.write_text('fixture')
    gettarinfo = tarfile.TarFile.gettarinfo
    def racing(self, name=None, arcname=None, fileobj=None):
        if name and Path(name) == vanishing and vanishing.exists():
            vanishing.unlink()
        return gettarinfo(self, name, arcname, fileobj)
    tarfile.TarFile.gettarinfo = racing
    configured = source.replace("root = Path('/srv/visulaserz')", f'root = Path({root.as_posix()!r})')
    assert configured != source
    try:
        exec(compile(configured, 'backup.py', 'exec'), {'__name__': '__main__'})
    finally:
        tarfile.TarFile.gettarinfo = gettarinfo
    assert not vanishing.exists(), 'the race was simulated'
    with tarfile.open(next((root / 'backups').glob('visulaserz-*.tar.gz'))) as archive:
        names = set(archive.getnames())
        assert 'data/cache/users/permanent/AAAAAAAAAAA.mp3' in names
        assert 'data/cache/users/permanent/AAAAAAAAAAA.jpg' in names
        assert 'data/cache/users/temporary/AAAAAAAAAAA.mp3' not in names
        assert 'data/cache/users/temporary/AAAAAAAAAAA.jpg' not in names
        assert 'data/cache/users/temporary/BBBBBBBBBBB.mp3' not in names
        assert not any(name.endswith('.part') for name in names)
        for user in ('permanent', 'temporary'):
            assert f'data/cache/users/{user}/AAAAAAAAAAA.json' in names
            assert archive.getmember(f'data/cache/users/{user}').isdir()
        assert archive.extractfile('data/cache/users/permanent/AAAAAAAAAAA.mp3').read() == b'fixture'
        assert 'data/accounts.sqlite' in names
print('PASS: permanent audio backed up; ordinary audio and partials excluded; all bookmarks preserved; a file deleted mid-walk is skipped.')
