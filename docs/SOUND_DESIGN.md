# Direção sonora — TankDots Wars

Os efeitos seguem a mesma linguagem da arte: ataque curto e legível, textura de máquina militar e cor de arcade. Cada arma deve poder ser reconhecida pelo início do som. Explosões grandes têm corpo grave; a interface usa cliques metálicos discretos; água, gelo, madeira, vento e eletricidade têm texturas próprias. A música não faz parte deste pacote de efeitos.

## Biblioteca

- `client/sounds/` contém 65 efeitos WAV gerados com ElevenLabs Sound Effects v2 e o arquivo de música já existente.
- Todos os efeitos são PCM mono, 22.050 Hz, 16 bits. A normalização usa volume médio por categoria e limitador suave, preservando espaço para sons simultâneos.
- `client/audio.js` usa os mesmos WAVs no desktop por Web Audio e no mobile pela reprodução nativa. O sintetizador antigo permanece como recurso se algum arquivo não carregar.
- O desktop carrega primeiro os efeitos frequentes e distribui o restante em pequenas etapas. O mobile carrega os arquivos conforme são usados, para preservar a compatibilidade com iPhone e Android.
- Efeitos novos cobrem seleção e combinação no HUD, metralhadora da Sentinela, jato e mina aquática, gelo, árvores, arpão, mordida do Caçador Aquático, chuva, vendaval, bombardeio, erupção, suprimentos, perfuração AP e meteoro.

## Regeneração

Autentique a ElevenLabs pelo fluxo `npx -y @elevenlabs/cli@latest onboard init` e mantenha `.env.local` fora do Git. Para refazer tudo, execute `npm run generate:sfx`. Para refazer apenas um efeito, use `node --env-file=.env.local scripts/generate-sfx.mjs shot-ap`. `npm run normalize:sfx` ajusta os arquivos existentes sem fazer chamadas à API.

Ao adicionar um efeito, defina o prompt em `scripts/generate-sfx.mjs`, inclua o nome em `SOUND_PRESETS` de `client/mobile-audio.js` e associe a ação em `client/audio.js`. Use um nome de arquivo estável para preservar cache e chamadas existentes.
