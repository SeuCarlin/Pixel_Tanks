# Direção sonora — TankDots Wars

Os efeitos seguem a mesma linguagem da arte: ataque curto e legível, textura de máquina militar e cor de arcade. Cada arma deve poder ser reconhecida pelo início do som. Explosões grandes têm corpo grave; a interface usa cliques metálicos discretos; água, gelo, madeira, vento e eletricidade têm texturas próprias. A música não faz parte deste pacote de efeitos.

## Biblioteca

- `client/sounds/` combina efeitos minimalistas do jogo com 28 gravações diferentes fornecidas em `D:\sons`. Quatro MP3s repetidos foram descartados. Todas as variantes de disparo do arsenal agora vêm dessas gravações, com cortes e pequenas mudanças de velocidade para preservar a identidade de cada arma; explosões principais, fogos, laser, água, meteoro, terremoto e metralhadora também as utilizam. Música, interface e ambiente foram preservados porque não havia gravações correspondentes na pasta.
- Todos os efeitos são PCM mono, 22.050 Hz, 16 bits. Os MP3s foram recortados, filtrados abaixo de 35 Hz, suavizados nas bordas e nivelados com teto de pico entre 0,55 e 0,67, deixando margem para sons simultâneos. O hover é um toque curto e discreto.
- `client/audio.js` usa os mesmos WAVs no desktop por Web Audio e no mobile pela reprodução nativa. O sintetizador antigo permanece como recurso se algum arquivo não carregar.
- O desktop carrega primeiro os efeitos frequentes e distribui o restante em pequenas etapas. O mobile carrega os arquivos conforme são usados e mantém canais nativos independentes para disparo, impacto e evento soarem juntos no iPhone e Android.
- Efeitos novos cobrem seleção e combinação no HUD, metralhadora da Sentinela, jato e mina aquática, gelo, árvores, arpão, mordida do Caçador Aquático, chuva, vendaval, bombardeio, erupção, suprimentos, perfuração AP e meteoro.
- O Bombardeio mantém aviso e colisões sincronizadas. Armas elétricas, minas, ataques elementais de água e terra e Reciclagem Vital têm disparos próprios.
- Vento, folhas, poeira e água têm camadas ambientais suaves. `client/ambient-sound.js` calcula a intensidade pela posição e pelo zoom da câmera: árvores, solo e lagos só são ouvidos perto deles. As camadas param quando a câmera se afasta, a partida termina ou o som é desligado.
- Brisa, chuva, neve, gelo, incêndio e água em cascata receberam novas texturas curtas. Elas foram geradas com ElevenLabs, convertidas para mono em 22.050 Hz, filtradas e quantizadas levemente para preservar a sonoridade minimalista. A câmera escolhe no máximo duas camadas ao mesmo tempo, deixando canais livres para combate no mobile.
- Um tronco que cai usa um contato curto e baixo de madeira, limitado a dois impactos audíveis por fragmento; a quebra da árvore conserva o som próprio.
- Tiros e impactos usam as amostras fornecidas quando há uma correspondente. Materiais, AP, laser, fogo, vento e gelo têm chamadas no momento da colisão. Bombardeio toca lançamento e impactos em tempos separados; a Sentinela toca cinco estampidos dentro de um único efeito. Um impacto comum toca uma só detonação.

## Regeneração

Para remontar os efeitos enviados pelo jogador, instale `numpy` e `imageio-ffmpeg` no Python e execute `python scripts/import-local-sfx.py D:\sons`. O script contém a relação exata entre cada MP3 de origem e cada WAV de destino. Os WAVs finais já estão no repositório; os MP3s de origem não são necessários para jogar.

Para regenerar apenas os efeitos minimalistas restantes, execute `npm run generate:minimal-sfx` (ou `npm.cmd run generate:minimal-sfx` no PowerShell). O gerador preserva os WAVs importados; `scripts/generate-impact-sfx.mjs` serve para substituir deliberadamente os impactos importados.

Para regenerar apenas as seis texturas ambientais novas, use `npm run generate:ambient-sfx` após configurar `ELEVENLABS_API_KEY` em `.env.local`. O script `generate:minimal-sfx` preserva esses arquivos. Os WAVs finais já estão no repositório e não exigem chave para jogar.

Ao adicionar um efeito, inclua o nome em `SOUND_PRESETS` de `client/mobile-audio.js`, ajuste a síntese se necessário e associe a ação em `client/audio.js`. Ao substituir um WAV no mesmo caminho, atualize `AUDIO_ASSET_VERSION` em `client/audio-assets.js`: desktop e mobile pedem a revisão nova em vez de reutilizar uma gravação antiga do cache. O botão **TESTAR SONS** na tela inicial reproduz tiro, explosão e laser para conferir o pacote carregado.
