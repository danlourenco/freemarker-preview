import { describe, test, expect, vi } from 'vitest'
import { TemplateTreeProvider, type DirEntry, type TemplateNode } from './tree-provider.ts'

function fakeFs(map: Record<string, DirEntry[]>) {
  return {
    readdirSync: vi.fn((path: string) => {
      const entries = map[path]
      if (!entries) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
      return entries
    }),
  }
}

describe('TemplateTreeProvider.getChildren', () => {
  test('returns a placeholder node when there is no templatesRoot', async () => {
    const provider = new TemplateTreeProvider({
      getTemplatesRoot: () => null,
      fs: fakeFs({}),
    })

    const children = (await provider.getChildren()) as TemplateNode[]

    expect(children).toHaveLength(1)
    expect(children[0].kind).toBe('placeholder')
  })

  test('returns top-level folder/file nodes from templatesRoot, sorted folders-first', async () => {
    const root = '/tmp/templates'
    const provider = new TemplateTreeProvider({
      getTemplatesRoot: () => root,
      fs: fakeFs({
        [root]: [
          { name: 'welcome.ftlh', isDirectory: () => false, isFile: () => true },
          { name: 'partials', isDirectory: () => true, isFile: () => false },
          { name: 'README.md', isDirectory: () => false, isFile: () => true },
        ],
      }),
    })

    const children = (await provider.getChildren()) as TemplateNode[]

    const labels = children.map((c) => (c.kind === 'placeholder' ? '<placeholder>' : c.name))
    expect(labels).toEqual(['partials', 'welcome.ftlh'])
    expect(children[0].kind).toBe('folder')
    expect(children[1].kind).toBe('file')
  })

  test('returns the contents of a folder node', async () => {
    const root = '/tmp/t'
    const provider = new TemplateTreeProvider({
      getTemplatesRoot: () => root,
      fs: fakeFs({
        [root]: [{ name: 'partials', isDirectory: () => true, isFile: () => false }],
        [`${root}/partials`]: [
          { name: '_header.ftlh', isDirectory: () => false, isFile: () => true },
          { name: '_footer.ftl', isDirectory: () => false, isFile: () => true },
        ],
      }),
    })

    const folder: TemplateNode = {
      kind: 'folder',
      name: 'partials',
      fsPath: `${root}/partials`,
    }
    const children = (await provider.getChildren(folder)) as TemplateNode[]

    expect(
      children.map((c) => (c.kind === 'placeholder' ? '<placeholder>' : c.name)).sort(),
    ).toEqual(['_footer.ftl', '_header.ftlh'])
    expect(children.every((c) => c.kind === 'file')).toBe(true)
  })
})

describe('TemplateTreeProvider.getTreeItem', () => {
  test('file node produces a TreeItem whose command opens preview with the file URI', () => {
    const provider = new TemplateTreeProvider({
      getTemplatesRoot: () => '/tmp/t',
      fs: fakeFs({}),
    })

    const item = provider.getTreeItem({
      kind: 'file',
      name: 'welcome.ftlh',
      fsPath: '/tmp/t/welcome.ftlh',
    })

    expect(item.command?.command).toBe('freemarker.preview')
    const uriArg = (item.command?.arguments?.[0] as { fsPath: string }).fsPath
    expect(uriArg).toBe('/tmp/t/welcome.ftlh')
  })
})

describe('TemplateTreeProvider.refresh', () => {
  test('fires onDidChangeTreeData', () => {
    const provider = new TemplateTreeProvider({
      getTemplatesRoot: () => null,
      fs: fakeFs({}),
    })
    const listener = vi.fn()
    provider.onDidChangeTreeData(listener)

    provider.refresh()

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
