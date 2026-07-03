/**
 * Kidversa Brand Colors
 * Source: Logo analysis
 *
 * Purple (Primary): #5B2C8D - Logo background
 * Orange (Accent):  #F5A623 - Logo stars, dots, tagline
 * White:            #FFFFFF - Logo text
 */

export const colors = {
  primary: {
    DEFAULT: '#5B2C8D',
    light: '#7B4DB5',
    dark: '#4A2370',
    50: '#F3EEFA',
    100: '#E1D4F2',
    200: '#C3A9E5',
    300: '#A57ED8',
    400: '#8B5CC8',
    500: '#7B4DB5',
    600: '#5B2C8D',
    700: '#4A2370',
    800: '#3A1B57',
    900: '#2A133E',
  },
  accent: {
    DEFAULT: '#F5A623',
    light: '#FFC04D',
    dark: '#D48B1C',
    50: '#FFF8EB',
    100: '#FFEDC7',
    200: '#FFDB8A',
    300: '#FFC94D',
    400: '#FFB726',
    500: '#F5A623',
    600: '#D48B1C',
    700: '#A66B15',
    800: '#7A4E10',
    900: '#4D310A',
  },
  white: '#FFFFFF',
  black: '#000000',
} as const

export type ColorToken = typeof colors
