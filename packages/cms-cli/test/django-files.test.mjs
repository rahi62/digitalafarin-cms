import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inferDjangoFiles, detectRootUrlconf } from '../bin/django-files.js';

const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function backend(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-django-host-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), text);
  }
  return dir;
}

const MANAGE = (module) => `#!/usr/bin/env python\nimport os\nos.environ.setdefault("DJANGO_SETTINGS_MODULE", "${module}")\n`;
const SPLIT = {
  'manage.py': MANAGE('config.settings.dev'),
  'config/__init__.py': '',
  'config/settings/__init__.py': '',
  'config/settings/base.py': 'ROOT_URLCONF = "config.urls"\nINSTALLED_APPS = []\nREST_FRAMEWORK = {"DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.LimitOffsetPagination"}\n',
  'config/settings/dev.py': 'from .base import *\nDEBUG = True\n',
  'config/urls.py': 'from django.urls import path\nurlpatterns = []\n',
};

test('split settings: ROOT_URLCONF is read through the imported base module before any guess', (t) => {
  const dir = backend(t, SPLIT);
  const result = inferDjangoFiles(dir);
  assert.equal(result.settingsFile, path.join(dir, 'config/settings/dev.py'));
  assert.equal(result.urlsFile, path.join(dir, 'config/urls.py'));
  assert.equal(result.urlsSource, 'ROOT_URLCONF');
  assert.equal(detectRootUrlconf(dir, result.settingsFile), 'config.urls');
});

test('absolute and aliased base imports are followed too', (t) => {
  const dir = backend(t, {
    ...SPLIT,
    'config/settings/dev.py': 'from config.settings.base import *\n',
    'config/settings/base.py': 'ROOT_URLCONF = \'project.routes\'\n',
    'project/__init__.py': '', 'project/routes.py': 'urlpatterns = []\n',
  });
  assert.equal(inferDjangoFiles(dir).urlsFile, path.join(dir, 'project/routes.py'));
  const dir2 = backend(t, { ...SPLIT, 'config/settings/dev.py': 'from . import base\nDEBUG = True\n' });
  assert.equal(inferDjangoFiles(dir2).urlsSource, 'ROOT_URLCONF');
});

test('explicit --settings-file and --urls-file win, stay inside the backend and must exist', (t) => {
  const dir = backend(t, { ...SPLIT, 'other/urls.py': 'urlpatterns = []\n' });
  const explicit = inferDjangoFiles(dir, { settingsFile: 'config/settings/base.py', urlsFile: 'other/urls.py' });
  assert.equal(explicit.settingsFile, path.join(dir, 'config/settings/base.py'));
  assert.equal(explicit.urlsFile, path.join(dir, 'other/urls.py'));
  assert.equal(explicit.urlsSource, 'flag');
  assert.throws(() => inferDjangoFiles(dir, { settingsFile: '../escape.py' }), /inside the backend/);
  assert.throws(() => inferDjangoFiles(dir, { settingsFile: 'config/settings/missing.py' }), /not found/);
  assert.throws(() => inferDjangoFiles(dir, { urlsFile: 'nope/urls.py' }), /not found/);
});

test('classic single-module projects keep working, including the urls.py guess', (t) => {
  const classic = backend(t, {
    'manage.py': MANAGE('mysite.settings'), 'mysite/__init__.py': '',
    'mysite/settings.py': 'ROOT_URLCONF = "mysite.urls"\n', 'mysite/urls.py': 'urlpatterns = []\n',
  });
  assert.equal(inferDjangoFiles(classic).urlsSource, 'ROOT_URLCONF');
  const guessed = backend(t, {
    'manage.py': MANAGE('mysite.settings'), 'mysite/__init__.py': '', 'mysite/settings.py': 'DEBUG = True\n', 'mysite/urls.py': 'urlpatterns = []\n',
  });
  assert.equal(inferDjangoFiles(guessed).urlsSource, 'guess');
  const broken = backend(t, { 'manage.py': MANAGE('mysite.settings'), 'mysite/__init__.py': '', 'mysite/settings.py': 'ROOT_URLCONF = "mysite.gone"\n' });
  assert.throws(() => inferDjangoFiles(broken), /Pass --urls-file/);
});

test('circular settings imports terminate', (t) => {
  const dir = backend(t, {
    'manage.py': MANAGE('a.settings'), 'a/__init__.py': '',
    'a/settings.py': 'from .other import *\n', 'a/other.py': 'from .settings import *\n', 'a/urls.py': 'urlpatterns = []\n',
  });
  assert.equal(inferDjangoFiles(dir).urlsSource, 'guess');
});

test('init patches the detected split settings dev.py and the real ROOT_URLCONF only', (t) => {
  const dir = backend(t, SPLIT);
  const result = spawnSync(process.execPath, [cli, 'init', '--backend', dir, '--skip-install', '--skip-migrate'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /config\/settings\/dev\.py.*config\/urls\.py \(ROOT_URLCONF\)/);
  assert.match(fs.readFileSync(path.join(dir, 'config/settings/dev.py'), 'utf8'), /BEGIN DIGITALAFARIN CMS[\s\S]*apply_defaults/);
  assert.match(fs.readFileSync(path.join(dir, 'config/urls.py'), 'utf8'), /digitalafarin_cms\.urls/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'config/settings/base.py'), 'utf8'), /DIGITALAFARIN/);
  assert.ok(!fs.existsSync(path.join(dir, 'config/settings/urls.py')), 'must not guess a urls.py inside settings/');
  const again = spawnSync(process.execPath, [cli, 'init', '--backend', dir, '--skip-install', '--skip-migrate'], { cwd: dir, encoding: 'utf8' });
  assert.equal(again.status, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'config/urls.py'), 'utf8').match(/BEGIN DIGITALAFARIN CMS/g).length, 1);
});

test('init honours --settings-file and --urls-file', (t) => {
  const dir = backend(t, SPLIT);
  const result = spawnSync(process.execPath, [
    cli, 'init', '--backend', dir, '--skip-install', '--skip-migrate',
    '--settings-file', 'config/settings/base.py', '--urls-file', 'config/urls.py',
  ], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(fs.readFileSync(path.join(dir, 'config/settings/base.py'), 'utf8'), /apply_defaults/);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'config/settings/dev.py'), 'utf8'), /DIGITALAFARIN/);
});
