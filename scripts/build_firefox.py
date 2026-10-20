"""Generate a Firefox-only package from the shared extension; no dependencies."""
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'extension'
OUTPUT = ROOT / 'dist' / 'firefox'


def build():
    # This directory contains generated files only. Rebuild from scratch so
    # removed probes/modules cannot survive in a release package.
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for source in SOURCE.iterdir():
        if source.is_file() and source.name != 'manifest.json':
            shutil.copyfile(source, OUTPUT / source.name)
        elif source.is_dir():
            shutil.copytree(source, OUTPUT / source.name)
    manifest = json.loads((SOURCE / 'manifest.json').read_text())
    manifest.pop('minimum_chrome_version', None)
    manifest['background'] = {'scripts': ['worker.js'], 'type': 'module'}
    manifest['browser_specific_settings'] = {
        'gecko': {'id': 'chat-commander-poc@local.invalid', 'strict_min_version': '140.0',
                  'data_collection_permissions': {'required': [
                      'authenticationInfo', 'personalCommunications', 'websiteContent']}},
        'gecko_android': {'strict_min_version': '142.0'}
    }
    (OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print(OUTPUT / 'manifest.json')


if __name__ == '__main__':
    build()
