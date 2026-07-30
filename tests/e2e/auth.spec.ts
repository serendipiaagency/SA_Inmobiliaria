import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = 'admin@sa-inmobiliaria.com'
const ADMIN_PASSWORD = 'ChangeMe123!'

test.describe('Login admin vs. consumidor', () => {
  test('/admin sin sesión redirige a /admin/login', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('/admin/login con credenciales válidas entra al panel', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/contrase/i).fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /acceder/i }).click()
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 10_000 })
  })

  test('/admin/login con credenciales inválidas muestra error y no entra', async ({ page }) => {
    await page.goto('/admin/login')
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/contrase/i).fill('wrong-password')
    await page.getByRole('button', { name: /acceder/i }).click()
    await expect(page.getByText(/inválidas|no tiene acceso/i)).toBeVisible()
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('/login (consumidor) con una cuenta de staff también redirige a /admin', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(ADMIN_EMAIL)
    await page.getByLabel(/contrase/i).fill(ADMIN_PASSWORD)
    await page.getByRole('button', { name: /acceder/i }).click()
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 10_000 })
  })
})
