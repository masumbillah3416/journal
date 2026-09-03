import { describe, expect, it } from 'vitest'
import {
  MOBILE_READING_MAX_WIDTH_PX,
  rememberedSurface,
  servedReadingSurface,
  SURFACE_COOKIE_NAME,
  surfaceCookie,
  surfaceForWidth,
} from './readingSurface'

describe('surfaceForWidth', () => {
  it('reads a phone-width viewport as the mobile reading mode', () => {
    expect(surfaceForWidth(390)).toBe('mobile')
  })

  it('reads a desktop-width viewport as the book', () => {
    expect(surfaceForWidth(1440)).toBe('book')
  })

  it('puts the breakpoint itself on the book, because the handoff writes it as "< 860px"', () => {
    expect(surfaceForWidth(MOBILE_READING_MAX_WIDTH_PX)).toBe('book')
  })

  it('puts the pixel below the breakpoint on the mobile reading mode', () => {
    expect(surfaceForWidth(MOBILE_READING_MAX_WIDTH_PX - 1)).toBe('mobile')
  })

  it('reads an unmeasured, zero-width viewport as the mobile reading mode rather than throwing', () => {
    // A measurement of zero is what a detached or display:none container
    // reports. Neither surface is right for it, and the narrower one is the
    // one that cannot be off the screen.
    expect(surfaceForWidth(0)).toBe('mobile')
  })

  it('states the breakpoint the handoff gives it', () => {
    expect(MOBILE_READING_MAX_WIDTH_PX).toBe(860)
  })
})

describe('servedReadingSurface', () => {
  it('serves the book to a device the user-agent does not call mobile', () => {
    expect(servedReadingSurface({ remembered: undefined, device: undefined })).toBe('book')
  })

  it('serves the mobile reading mode to a phone, so its first paint is the surface it will keep', () => {
    expect(servedReadingSurface({ remembered: undefined, device: 'mobile' })).toBe('mobile')
  })

  it('serves the mobile reading mode to a tablet, whose portrait width is under the breakpoint', () => {
    expect(servedReadingSurface({ remembered: undefined, device: 'tablet' })).toBe('mobile')
  })

  it('serves the book to a device kind the hint names but the design does not', () => {
    expect(servedReadingSurface({ remembered: undefined, device: 'smarttv' })).toBe('book')
  })

  it('prefers what the reader’s own browser measured over the user-agent guess', () => {
    // A narrow window on a desktop: the hint says book, the measurement says
    // otherwise, and the measurement is the one that saw the viewport.
    expect(servedReadingSurface({ remembered: 'mobile', device: undefined })).toBe('mobile')
  })

  it('prefers a remembered book over a phone user-agent, for a wide tablet', () => {
    expect(servedReadingSurface({ remembered: 'book', device: 'mobile' })).toBe('book')
  })
})

describe('rememberedSurface', () => {
  it('finds the surface a previous correction remembered', () => {
    expect(rememberedSurface(`${SURFACE_COOKIE_NAME}=mobile`)).toBe('mobile')
  })

  it('finds it among other cookies, whatever the order', () => {
    expect(rememberedSurface(`other=1; ${SURFACE_COOKIE_NAME}=book; third=x`)).toBe('book')
  })

  it('remembers nothing when there is no cookie header at all', () => {
    expect(rememberedSurface(undefined)).toBe(undefined)
  })

  it('remembers nothing from a header that does not carry this cookie', () => {
    expect(rememberedSurface('other=1; third=x')).toBe(undefined)
  })

  it('refuses a value that is not one of the two surfaces', () => {
    // The cookie is reader-writable, so its value is untrusted input and is
    // validated rather than cast (CLAUDE.md §3.1).
    expect(rememberedSurface(`${SURFACE_COOKIE_NAME}=tablet`)).toBe(undefined)
  })

  it('is not fooled by a cookie whose name merely ends with this one', () => {
    expect(rememberedSurface(`not-${SURFACE_COOKIE_NAME}=mobile`)).toBe(undefined)
  })

  it('reads a header written without spaces after the separators', () => {
    expect(rememberedSurface(`a=1;${SURFACE_COOKIE_NAME}=mobile;b=2`)).toBe('mobile')
  })

  it('remembers nothing from a cookie present but empty', () => {
    expect(rememberedSurface(`${SURFACE_COOKIE_NAME}=`)).toBe(undefined)
  })
})

describe('surfaceCookie', () => {
  it('writes the correction as a path-wide, same-site session cookie', () => {
    expect(surfaceCookie('mobile')).toBe(`${SURFACE_COOKIE_NAME}=mobile; Path=/; SameSite=Lax`)
  })

  it('round-trips through the reader it is written for', () => {
    expect(rememberedSurface(surfaceCookie('book'))).toBe('book')
  })
})
