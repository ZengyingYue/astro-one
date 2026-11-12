/** Independent Ubuntu/Windows distribution, without an upstream update feed or signing identity. */
import { resolveDesktopTargetBuildPaths, resolveDesktopBuildTarget, desktopTargetPlatform } from './scripts/desktop-build-paths.mjs'
import { join, relative, sep } from 'node:path'
import { officePackageDirectories } from '../../scripts/libreoffice-packages.mjs'

const paths = resolveDesktopTargetBuildPaths()
const target = desktopTargetPlatform(resolveDesktopBuildTarget())
export default {
  appId: 'io.astro-one.desktop',
  productName: 'Astro One',
  artifactName: 'astro-one-${version}-${os}-${arch}.${ext}',
  extraMetadata: { name: 'astro-one', desktopName: 'astro-one.desktop', homepage: 'https://github.com/ZengyingYue/astro-one', astroOneDesktopAppId: 'io.astro-one.desktop' },
  directories: { output: join(paths.root, 'local-artifacts') },
  electronDist: paths.electron,
  electronFuses: { runAsNode: true },
  asar: true,
  asarUnpack: ['**/*.{node,dylib,dll,so,exe}', '**/*.so.*', '**/spawn-helper', '**/@vscode/ripgrep-*/bin/rg', '**/@deepseek-ai/libreoffice-kit-*/**/*'],
  files: ['lib/main.js', 'lib/welcome/**/*', 'lib/preload-*.cjs', 'renderer/**/*', 'package.json',
    { from: paths.astroOne, to: 'astro-one', filter: ['**/*'] },
    { from: join(paths.astroOne, 'node_modules'), to: 'astro-one/node_modules', filter: ['**/*'] }],
  extraResources: [{ from: paths.runtime, to: 'runtime' }, { from: 'resources/icon-windows.png', to: 'icon.png' }],
  linux: { target: ['AppImage', 'deb'], syncDesktopName: true, category: 'Development', executableName: 'astro-one', icon: 'resources/icon-windows.png', maintainer: 'Astro One contributors' },
  win: { target: ['nsis'], icon: 'resources/icon-windows.png', signExecutable: false },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, deleteAppDataOnUninstall: false },
  beforePack: async context => {
    const directories = await officePackageDirectories(paths.astroOne, target)
    context.packager.config.asarUnpack.push(...directories.map(directory =>
      `**/${relative(paths.astroOne, directory).split(sep).join('/')}/**/*`))
  },
  publish: null,
}
