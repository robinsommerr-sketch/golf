from pathlib import Path
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent/'public'
soup=BeautifulSoup((root/'index.html').read_text(),'html.parser')
for node in soup.select('script,link'):node.decompose()
html=str(soup)
css=(root/'styles.css').read_text()
langjs=(root/'i18n.js').read_text()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1400,'height':900},device_scale_factor=1)
 errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded');page.add_style_tag(content=css);page.add_script_tag(content="window.__store={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>window.__store[k]??null,setItem:(k,v)=>window.__store[k]=v}})");page.add_script_tag(content=langjs)
 assert page.locator('html').get_attribute('lang')=='en'
 assert page.locator('#guestPlay').inner_text().startswith('Play free now')
 assert page.locator('.language-switch button').count()==2
 assert page.locator('#login').inner_text()=='Log in'
 page.locator('[data-language=no]').click();page.wait_for_timeout(150)
 assert page.locator('html').get_attribute('lang')=='no'
 assert page.locator('#guestPlay').inner_text().startswith('Spill gratis nå')
 assert page.locator('#login').inner_text()=='Logg inn'
 assert page.evaluate('localStorage.getItem("fc_lang")')=='no'
 page.locator('#phaseTitle').evaluate('(e)=>e.textContent="Velg riktig lengde"')
 page.wait_for_timeout(150)
 assert page.locator('#phaseTitle').inner_text()=='Velg riktig lengde'
 page.locator('[data-language=en]').click();page.wait_for_timeout(150)
 assert page.locator('#guestPlay').inner_text().startswith('Play free now')
 assert page.locator('#phaseTitle').inner_text()=='Choose your distance'
 page.locator('#phaseTitle').evaluate('(e)=>e.textContent="Retningen er låst"')
 page.wait_for_timeout(100)
 assert page.locator('#phaseTitle').inner_text()=='Aim is locked'
 page.locator('[data-language=no]').click();page.wait_for_timeout(100)
 assert page.locator('#phaseTitle').inner_text()=='Retningen er låst'
 page.locator('[data-language=en]').click();page.wait_for_timeout(100)
 page.screenshot(path=str(root.parent/'tests/language-english.png'))
 print('desktop i18n okay, errors=',errs)
 assert not errs,errs
 mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1)
 errors=[];mobile.on('pageerror',lambda e:errors.append(str(e)))
 mobile.set_content(html,wait_until='domcontentloaded');mobile.add_style_tag(content=css);mobile.add_script_tag(content="window.__store={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>window.__store[k]??null,setItem:(k,v)=>window.__store[k]=v}})");mobile.add_script_tag(content=langjs)
 assert mobile.locator('[data-language=en]').is_visible()
 assert mobile.locator('[data-language=no]').is_visible()
 assert mobile.locator('html').get_attribute('lang')=='en'
 width=mobile.evaluate('document.documentElement.scrollWidth')
 assert width<=390, width
 mobile.screenshot(path=str(root.parent/'tests/language-mobile.png'))
 print('mobile i18n okay, errors=',errors)
 assert not errors,errors
 browser.close()
