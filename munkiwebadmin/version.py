'''The running version, shown at the bottom of the sidebar.

VERSION (in the repo root) holds the release, bumped by hand. COMMIT is
written by the build (GitHub Actions); without it, git is asked directly,
which covers running from a checkout.'''
import os
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _read(name):
    try:
        with open(os.path.join(BASE_DIR, name)) as f:
            return f.read().strip()
    except OSError:
        return ''


def _git_commit():
    try:
        return subprocess.run(['git', 'rev-parse', '--short', 'HEAD'],
                              cwd=BASE_DIR, capture_output=True, text=True,
                              timeout=5).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ''


VERSION = _read('VERSION') or 'dev'
COMMIT = _read('COMMIT')[:7] or _git_commit()
