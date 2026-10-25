# Direção sonora — TankDots Wars

Os efeitos seguem a mesma linguagem da arte: ataque curto e legível, textura de máquina militar e cor de arcade. Cada arma deve poder ser reconhecida pelo início do som. Explosões grandes têm corpo grave; a interface usa cliques metálicos discretos; água, gelo, madeira, vento e eletricidade têm texturas próprias. A música não faz parte deste pacote de efeitos.

## Biblioteca

- `client/sounds/` usa novamente as formas de onda dos 42 efeitos sintéticos minimalistas anteriores ao pacote ElevenLabs. Efeitos adicionados depois seguem a mesma linguagem sonora por síntese local. O arquivo de música existente foi preservado.
- Todos os efeitos são PCM mono, 22.050 Hz, 16 bits. O ganho dos efeitos baixos foi nivelado sem mudar seu timbre; o pico máximo mantém margem para sons simultâneos. O hover é um toque curto e discreto.
- `client/audio.js` usa os mesmos WAVs no desktop por Web Audio e no mobile pela reprodução nativa. O sintetizador antigo permanece como recurso se algum arquivo não carregar.
- O desktop carrega primeiro os efeitos frequentes e distribui o restante em pequenas etapas. O mobile carrega os arquivos conforme são usados e mantém canais nativos independentes para disparo, impacto e evento soarem juntos no iPhone e Android.
- Efeitos novos cobrem seleção e combinação no HUD, metralhadora da Sentinela, jato e mina aquática, gelo, árvores, arpão, mordida do Caçador Aquático, chuva, vendaval, bombardeio, erupção, suprimentos, perfuração AP e meteoro.
- O Bombardeio mantém aviso e colisões sincronizadas. Armas elétricas, minas, ataques elementais de água e terra e Reciclagem Vital têm disparos próprios.
- Vento, folhas, poeira e água têm camadas ambientais suaves. `client/ambient-sound.js` calcula a intensidade pela posição e pelo zoom da câmera: árvores, solo e lagos só são ouvidos perto deles. As camadas param quando a câmera se afasta, a partida termina ou o som é desligado.
- Brisa, chuva, neve, gelo, incêndio e água em cascata receberam novas texturas curtas. Elas foram geradas com ElevenLabs, convertidas para mono em 22.050 Hz, filtradas e quantizadas levemente para preservar a sonoridade minimalista. A câmera escolhe no máximo duas camadas ao mesmo tempo, deixando canais livres para combate no mobile.
- Um tronco que cai usa um contato curto e baixo de madeira, limitado a dois impactos audíveis por fragmento; a quebra da árvore conserva o som próprio.
- Disparos e explosões voltaram às amostras sintetizadas originais do commit `5189e03`, com o mesmo nivelamento de volume que já usávamos. Armas introduzidas depois reutilizam sons próximos dessa família. Impactos explosivos tocam uma única detonação; o Bombardeio usa a explosão pesada original. Os sons de ambiente e interface continuam independentes.

## Regeneração

Para regenerar e nivelar o pacote minimalista, execute `npm run generate:minimal-sfx` (ou `npm.cmd run generate:minimal-sfx` no PowerShell). Para gerar um efeito novo específico, passe o nome, por exemplo `node scripts/generate-minimal-sfx.mjs shot-kinetic`, e depois execute `node scripts/balance-minimal-sfx.mjs`. As formas de onda dos 42 arquivos originais vieram do commit `5189e03`; o nivelador só altera seu ganho. O gerador ElevenLabs antigo para tiros e explosões permanece no repositório como alternativa.

Para regenerar apenas as seis texturas ambientais novas, use `npm run generate:ambient-sfx` após configurar `ELEVENLABS_API_KEY` em `.env.local`. O script `generate:minimal-sfx` preserva esses arquivos. Os WAVs finais já estão no repositório e não exigem chave para jogar.

Ao adicionar um efeito, inclua o nome em `SOUND_PRESETS` de `client/mobile-audio.js`, ajuste a síntese se necessário e associe a ação em `client/audio.js`. Use um nome de arquivo estável para preservar cache e chamadas existentes.
