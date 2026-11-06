import { LANG } from '@/constant'
import { language } from '@/store/settings'
import { omit } from 'lodash'
import { createI18n } from 'vue-i18n'
import en, { type LANG_MESSAGE } from './en'
import ru from './ru'
import singboxEn from './singbox/en'
import singboxRu from './singbox/ru'
import singboxZh from './singbox/zh'
import singboxZhTW from './singbox/zh-tw'
import zh from './zh'
import zhTW from './zh-tw'

// 测速进度使用扩展的 testProgressTip，原作者词条保留在基础语言文件中。
const withSingbox = (
  base: LANG_MESSAGE,
  extension: typeof singboxEn,
) => ({ ...omit(base, 'testFinishedTip'), ...extension })

export const i18n = createI18n({
  legacy: false,
  locale: language.value,
  fallbackLocale: LANG.EN_US,
  messages: {
    [LANG.EN_US]: withSingbox(en, singboxEn),
    [LANG.ZH_CN]: withSingbox(zh, singboxZh),
    [LANG.ZH_TW]: withSingbox(zhTW, singboxZhTW),
    [LANG.RU_RU]: withSingbox(ru, singboxRu),
  },
})
