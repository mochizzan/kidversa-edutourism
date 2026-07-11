import { MissionCategory } from '../types/enums'

export const A4_SHEET_WIDTH = 794 // px — A4 at 96dpi

export const DEFAULT_FACILITATOR_MESSAGE =
  'Terima kasih telah berpartisipasi dalam Program Kidversa Edu-Tourism. Semoga pengalaman belajar hari ini memberikan inspirasi dan kebahagiaan bagi si kecil. Sampai jumpa di sesi berikutnya!'

export const DEFAULT_FACILITATOR_NAME = 'Fasilitator Kidversa'

export const missionCategoryLabels: Record<MissionCategory, string> = {
  [MissionCategory.HOME]: 'Di Rumah',
  [MissionCategory.PARENT]: 'Bersama Orang Tua',
  [MissionCategory.SCHOOL]: 'Di Sekolah',
}

export const missionCategoryIcons: Record<MissionCategory, string> = {
  [MissionCategory.HOME]: '\u{1F3E0}',
  [MissionCategory.PARENT]: '\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}',
  [MissionCategory.SCHOOL]: '\u{1F3EB}',
}
