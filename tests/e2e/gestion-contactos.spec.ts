import { test, expect } from '@playwright/test'
import { STATE_A } from './global-setup'

/**
 * Cola 15 — «Gestión de contactos»: Leads, Contactos y Clientes se unifican en
 * UNA sección del menú con una barra de pestañas. Las tres rutas y sus fichas
 * siguen existiendo; sólo cambia cómo se navega.
 */
test.describe('Gestión de contactos (Cola 15)', () => {
  test.use({ storageState: STATE_A })

  test('el menú enseña una sola entrada y la barra de pestañas cambia de sección', async ({ page }) => {
    await page.goto('/admin/contactos')
    const nav = page.getByTestId('admin-nav')
    const crm = page.getByTestId('nav-group-items-crm')

    // Una entrada «Gestión de contactos»; ni «Leads» ni «Clientes» sueltas en el menú.
    await expect(crm.getByRole('link', { name: 'Gestión de contactos', exact: true })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Leads', exact: true })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Clientes', exact: true })).toHaveCount(0)

    // La barra de pestañas de la sección, con la de Contactos activa.
    const tabs = page.getByTestId('contact-hub-tabs')
    await expect(tabs).toBeVisible()
    await expect(page.getByTestId('contact-hub-tab-contactos')).toHaveAttribute('aria-current', 'page')

    // Cambiar a Leads: la URL y la pestaña activa cambian; la entrada del menú sigue siendo la unificada.
    await page.getByTestId('contact-hub-tab-leads').click()
    await expect(page).toHaveURL(/\/admin\/leads$/)
    await expect(page.getByTestId('contact-hub-tab-leads')).toHaveAttribute('aria-current', 'page')
    await expect(crm.getByRole('link', { name: 'Gestión de contactos', exact: true })).toHaveAttribute('aria-current', 'page')

    // Y a Clientes.
    await page.getByTestId('contact-hub-tab-clientes').click()
    await expect(page).toHaveURL(/\/admin\/clientes$/)
    await expect(page.getByTestId('contact-hub-tab-clientes')).toHaveAttribute('aria-current', 'page')
  })

  test('una ficha (deep link) mantiene su pestaña y la entrada unificada activas', async ({ page }) => {
    // La pestaña Leads sale activa aunque estemos en una subruta de leads.
    await page.goto('/admin/leads')
    await expect(page.getByTestId('contact-hub-tab-leads')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('nav-group-items-crm').getByRole('link', { name: 'Gestión de contactos', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})
