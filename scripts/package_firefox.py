"""Build a deterministic unsigned AMO upload archive; never upload or sign."""
from pathlib import Path
import hashlib
import zipfile
from build_firefox import build, ROOT, OUTPUT
import json


def package():
    build()
    version = json.loads((OUTPUT / 'manifest.json').read_text())['version']
    archive = ROOT / 'dist' / f'chat-commander-{version}-firefox.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        for path in sorted(OUTPUT.rglob('*')):
            if not path.is_file():
                continue
            info = zipfile.ZipInfo(path.relative_to(OUTPUT).as_posix(), (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, path.read_bytes())
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_suffix('.zip.sha256').write_text(f'{checksum}  {archive.name}\n')
    print(archive)
    # Explicit source allowlist: never package workspace state, HARs or credentials.
    source_archive = ROOT / 'dist' / f'chat-commander-{version}-source.zip'
    sources = [p for p in sorted((ROOT / 'extension').rglob('*')) if p.is_file()]
    sources += [ROOT / name for name in ['scripts/build_firefox.py', 'scripts/package_firefox.py', 'LICENSE']]
    with zipfile.ZipFile(source_archive, 'w', compression=zipfile.ZIP_DEFLATED) as output:
        entries = {p.relative_to(ROOT).as_posix(): p.read_bytes() for p in sources}
        entries['BUILD.md'] = (f'# Chat Commander {version} source\n\n'
            'Requirements: Python 3 standard library, no network or package installation.\n'
            'Run from this directory: `python3 scripts/package_firefox.py`.\n'
            'The install archive is dist/chat-commander-' + version + '-firefox.zip.\n'
            'The shared manifest is transformed for Firefox by scripts/build_firefox.py.\n'
            'JavaScript is readable and copied unchanged; icons are checked-in build inputs.\n'
            'The source archive also regenerates itself. Never provide runtime keys or cookies.\n').encode()
        for name, data in sorted(entries.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            output.writestr(info, data)
    digest = hashlib.sha256(source_archive.read_bytes()).hexdigest()
    source_archive.with_suffix('.zip.sha256').write_text(f'{digest}  {source_archive.name}\n')
    print(source_archive)


if __name__ == '__main__':
    package()
