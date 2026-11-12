#!/usr/bin/env node

import { Context } from '@astro-one/cordis'
import { pathToFileURL } from 'node:url'
import Loader from '@astro-one/cordis-plugin-loader'

const ctx = new Context()
ctx.baseUrl = pathToFileURL(process.cwd()).href + '/'

await ctx.plugin(Loader)
await ctx.loader.create({
  name: '@astro-one/cordis-plugin-include',
  config: {
    path: './cordis.yml',
  },
})
