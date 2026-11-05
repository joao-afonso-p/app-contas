import { Card, SectionTitle } from './ui'
import { MENU_DEFAULT, MENU_LABEL, OPTIONAL_MENUS, menuVisible } from '../lib/menus'
import { useStore } from '../store/useStore'

// Definições → Menus visíveis: esconder ou mostrar os menus opcionais.
export function MenuSettingsSection() {
  const meta = useStore((s) => s.data.meta[0])
  const setMeta = useStore((s) => s.setMeta)

  const toggle = (id: (typeof OPTIONAL_MENUS)[number], visible: boolean) =>
    void setMeta({ menus: { ...(meta?.menus ?? {}), [id]: visible } })

  return (
    <section>
      <SectionTitle>Menus visíveis</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">
          Escolhe que menus aparecem. Esconder um menu não apaga nada, podes voltar a mostrá-lo quando quiseres.
        </p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {OPTIONAL_MENUS.map((id) => (
            <li key={id}>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span>
                  <span className="font-medium">{MENU_LABEL[id]}</span>
                  {id === 'imoveis' && (
                    <span className="ml-2 text-xs text-muted">Lucro e retorno de casas arrendadas (só no computador)</span>
                  )}
                  {!MENU_DEFAULT[id] && id !== 'imoveis' && <span className="ml-2 text-xs text-muted">escondido por defeito</span>}
                </span>
                <input
                  type="checkbox"
                  checked={menuVisible(meta, id)}
                  onChange={(e) => toggle(id, e.target.checked)}
                  className="h-4 w-4 shrink-0 accent-[var(--accent-strong)]"
                  aria-label={`Mostrar ${MENU_LABEL[id]} no menu`}
                />
              </label>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  )
}
