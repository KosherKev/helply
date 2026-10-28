/** The product name lives here and nowhere else. Never hard-code it in copy. */
export const BRAND: string = process.env.NEXT_PUBLIC_BRAND ?? 'Helply'
export const TAGLINE = "Support that speaks your customers' language and reads your logs."
export const DESCRIPTION = `${BRAND} answers in Twi, Ga, Ewe, Pidgin and English, then checks what actually happened in your system, so customers get a real answer instead of "we are looking into it".`
export const GITHUB_URL: string = process.env.NEXT_PUBLIC_GITHUB_URL ?? 'https://github.com/kevinafenyo/helply'
export const DEMO_URL: string = process.env.NEXT_PUBLIC_DEMO_URL ?? '/demo'
