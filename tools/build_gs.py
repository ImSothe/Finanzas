# -*- coding: utf-8 -*-
"""Genera los Code.gs:
 - backend/Code.gs  : GENÉRICO (sin tus datos) -> se puede versionar y compartir.
 - dist/Code.gs     : PERSONAL, con tu seed (categorías, sueldo, diccionario) -> para pegar en TU Google Sheets (no se sube a git).
Uso: python tools/build_gs.py
"""
import json
import re

tpl = open('backend/Code.gs.template', encoding='utf-8').read()
pat = re.compile(r'/\*SEED\*/.*?/\*END\*/', re.S)
assert pat.search(tpl), 'marcadores SEED no encontrados'

open('backend/Code.gs', 'w', encoding='utf-8', newline='\n').write(tpl)
seed = json.load(open('seed/seed.json', encoding='utf-8'))
personal = pat.sub(lambda m: '/*SEED*/' + json.dumps(seed, ensure_ascii=False) + '/*END*/', tpl)
open('dist/Code.gs', 'w', encoding='utf-8', newline='\n').write(personal)
print('backend/Code.gs (generico):', len(tpl), 'bytes | dist/Code.gs (personal):', len(personal), 'bytes')
