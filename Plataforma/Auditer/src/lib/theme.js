const KEY = 'spbim_theme'

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function setTheme(theme) {
  const dark = theme === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem(KEY, dark ? 'dark' : 'light')
  } catch {}
  return dark ? 'dark' : 'light'
}

export function toggleTheme() {
  return setTheme(getTheme() === 'dark' ? 'light' : 'dark')
}
