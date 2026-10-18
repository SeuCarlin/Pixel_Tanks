# TankDots Wars — sistema visual de cartas

Este documento define o padrão visual obrigatório para cartas, miniaturas e futuras gerações de arte do jogo. Ele vale para Powerups, Arsenal, Classes e Eventos.

## Princípios

1. **Pixel art legível:** formas construídas com pixels duros, sem antialiasing, textura fotográfica ou pintura suave.
2. **Uma silhueta dominante:** cada item precisa ser reconhecível em 30 × 30 px. Detalhes secundários nunca podem competir com o símbolo principal.
3. **Família única, identidade individual:** fundo, enquadramento, luz e densidade são compartilhados; cor, silhueta e efeito identificam cada carta.
4. **Sem texto na ilustração:** nomes, categorias e valores pertencem ao HTML. Isso evita texto deformado, facilita tradução e mantém a arte reutilizável.
5. **Contraste de combate:** fundo azul-marinho, assunto claro, brilho cromático curto e bordas nítidas.
6. **Sem arte genérica repetida:** cada mecânica tem uma imagem própria, visualmente coerente com o efeito descrito.

## Anatomia da carta

- Fundo da arte: azul-marinho `#10243A`, podendo escurecer até `#07111F`.
- Corpo da carta: `#09131F` com borda `#25384C`.
- Título: fonte display condensada, branco `#F5F8FA`.
- Categoria e borda inferior: usam `info.color`, definido em `shared/constants.js`.
- Descrição: fonte monoespaçada, cinza-azulado `#9EB0C0`.
- Brilho: somente ao redor do assunto, com alcance curto. Nunca lavar todo o fundo.
- Composição: assunto centralizado, ocupando aproximadamente 62% da célula, com margem segura de 12%.

## Linguagem da ilustração

- Aparência 16-bit, blocos quadrados e contornos de 1–3 pixels.
- Paleta limitada a 5–8 cores por arte, além do fundo.
- Luz principal na cor da carta e pequenos realces quase brancos.
- Explosões usam núcleo claro, intermediário amarelo/laranja e borda vermelha.
- Energia usa ciano, azul ou violeta; cura usa verde; defesa usa azul; mobilidade usa amarelo/laranja.
- Classes sempre mostram um tanque lateral como personagem, modificado por equipamento e postura.
- Eventos mostram uma pequena cena de arena, com céu e solo suficientes para comunicar escala.
- Evitar gradientes lisos, ícones vetoriais, render 3D, perspectiva realista e elementos minúsculos sem função.

## Atlas oficiais

Os arquivos são versionados e não devem ser sobrescritos. Uma nova geração cria um novo sufixo (`v4`, `v2` etc.) e atualiza o CSS somente após revisão completa.

| Família | Arquivo | Grade | Quantidade |
|---|---|---:|---:|
| Powerups | `client/assets/powerup-art-atlas-v3.png` | 7 × 4 | 28 |
| Arsenal | `client/assets/arsenal-art-atlas-v3.png` | 4 × 4 | 16 |
| Classes | `client/assets/class-art-atlas-v1.png` | 4 × 2 | 8 |
| Eventos | `client/assets/event-art-atlas-v1.png` | 3 × 3 | 9 |

Três armas atualizadas usam imagens quadradas avulsas versionadas, sem alterar a ordem do atlas legado: `fragmentaria-card-v2.png`, `carga-sismica-card-v2.png` e `mega-canhao-card-v2.png`. O CSS aplica a mesma imagem à carta da biblioteca, seleção de arsenal e miniatura do HUD. A moldura, o nome, a categoria, o dano e a descrição continuam sendo HTML.

Prompts finais usados na geração raster (modo integrado):

- Fragmentária: “A glowing violet fragmentation missile capsule splitting in midair into exactly three small descending rockets, each with a purple exhaust trail; dark navy sky and a hint of blocky terrain far below. Richly detailed 2D game pixel art with crisp square pixels, violet, lavender, magenta and warm highlights. Square centered composition, clear at thumbnail size. No card frame, text, logo or watermark.”
- Carga Sísmica: “A seismic charge embedded in blocky earth; vivid red targeting lines and rectangular red warning zones drawn across the ground before detonation, with red-orange seismic energy beginning to glow in cracks beneath the marked soil. Richly detailed 2D pixel art, dark navy backdrop and dramatic orange-red lighting. Square centered composition. No card frame, text, logo or watermark.”
- Mega Canhão: “A colossal vertical electric-blue energy laser descending from a darkened storm sky onto a tiny planted blue target marker and shattering blocky earth, with cyan-white core, blue shockwave and square debris. Richly detailed 2D pixel art, dramatic navy-cyan palette. Square centered composition, white flash concentrated at impact. No card frame, text, logo or watermark.”

A leitura é sempre da esquerda para a direita e de cima para baixo. A ordem precisa acompanhar a ordem das chaves em `shared/constants.js`; `atlasStyle()` em `client/app.js` calcula automaticamente linha e coluna.

### Mapa: Powerups (7 × 4)

| Linha | Colunas 1 → 7 |
|---:|---|
| 1 | `lootbox`, `extraShot`, `doubleShot`, `tripleShot`, `bigExplosion`, `megaMissile`, `freeze` |
| 2 | `guidedBullet`, `heal`, `shield`, `movementBoost`, `rocketDash`, `lightningStep`, `bridgeKit` |
| 3 | `teleport`, `invisibility`, `excavator`, `armorPiercer`, `shockwave`, `bunkerBuster`, `ammoCrate` |
| 4 | `molotov`, `repairDrone`, `overcharge`, `laser`, `mirror`, `trickster` |

### Mapa: Arsenal (4 × 4)

| Linha | Colunas 1 → 4 |
|---:|---|
| 1 | `heavy`, `cluster`, `fireworks`, `zeus` |
| 2 | `gravity`, `grenade`, `mineLayer`, `moleBomb` |
| 3 | `armoredDash`, `verticalStrike`, `jump`, `spider` |
| 4 | `droneStrike`, `teslaOrb`, `seismicCharge`, `lightningRod` |

`flyingHunter` (Caça Voadora) agora é uma carta de arsenal com arte SVG pixelada própria, fora do atlas. A Haste permanece no atlas, mas só é liberada ao Meteorologista na rodada 2.

### Mapa: Classes (4 × 2)

| Linha | Colunas 1 → 4 |
|---:|---|
| 1 | `armored`, `attacker`, `bomber`, `healer` |
| 2 | `meteorologist`, `ninja`, `saboteur`, `backpacker` |

### Mapa: Eventos (3 × 3)

| Linha | Colunas 1 → 3 |
|---:|---|
| 1 | `supply`, `quake`, `bombardment` |
| 2 | `lightning`, `collapse`, `tectonic` |
| 3 | `luckyWinds`, `eruption`, `gale` |

## Aplicações

- **Biblioteca:** carta completa com faixa de arte no topo, categoria, nome e descrição abaixo. A célula quadrada fica centralizada na faixa, sem deformação.
- **Seleção de arsenal:** carta completa com arte, categoria, nome e descrição. A arte nunca substitui o texto funcional.
- **Seleção de classe:** miniatura quadrada ao lado do nome e da descrição da passiva.
- **HUD:** a mesma célula do atlas em miniatura; jamais criar uma versão visual diferente para o mesmo item.
- **Recompensa e coleta:** a mesma arte aparece ampliada para confirmar claramente o item recebido.
- **Mobile:** preservar miniatura mínima de 30 × 30 px e nunca colocar texto dentro dela.

## Prompt-base para futuras gerações

> Create one exact sprite atlas for TankDots Wars in authentic 16-bit pixel art. Dark navy card backdrop (#10243A), hard square pixels, no anti-aliasing, limited palette, crisp silhouette, controlled neon rim glow, centered subject occupying about 62% of every cell, consistent scale and lighting. Every cell must be visually unique and communicate its gameplay effect at 30 × 30 px. No text, letters, numbers, logos, labels, borders, UI or watermark. Exact GRID_COLUMNS × GRID_ROWS grid, subjects ordered left-to-right and top-to-bottom: SUBJECT_LIST.

Para Classes, acrescentar: “consistent side-view tank character in every cell”. Para Eventos: “small dramatic arena scene with visible sky and ground”. A imagem de referência deve ser uma carta aprovada do próprio jogo, nunca arte de outra franquia.

## Processo para adicionar conteúdo

1. Adicionar a definição ao final do objeto correto em `shared/constants.js`.
2. Definir nome, abreviação, cor e descrição antes de gerar a arte.
3. Acrescentar uma célula ao final do atlas ou criar uma nova versão/página sem reordenar células existentes.
4. Atualizar a grade em `ART_ATLASES`, o mapa deste documento e o nome versionado no CSS.
5. Conferir Biblioteca, Arsenal, HUD e card de coleta em desktop e mobile horizontal.
6. Verificar a arte a 30 × 30 px: se a mecânica não for reconhecível, simplificar a silhueta.

## Checklist de aprovação

- [ ] A célula corresponde exatamente à chave e à posição documentadas.
- [ ] A arte é única e representa a mecânica correta.
- [ ] Não há texto ou marca d'água dentro da imagem.
- [ ] Pixels e contornos permanecem nítidos.
- [ ] A miniatura continua legível no HUD.
- [ ] O fundo e a iluminação pertencem à mesma família das cartas atuais.
- [ ] A cor de destaque coincide com `info.color`.
- [ ] Desktop e mobile usam a mesma célula do mesmo atlas.
- [ ] O arquivo anterior foi preservado e o novo possui versão própria.

