# Revisão dos sons

Abra `http://localhost:3000/sound-review.html` com o servidor local do jogo ligado. A página mostra cinco sugestões por ocorrência. Clique em **+ BUSCAR OUTRO SOM** para pesquisar todo o catálogo ou selecionar um arquivo MP3/WAV do computador, inclusive de `D:\sons`. Você pode ouvir antes de confirmar.

Use a busca por **míssil** para revisar primeiro as trilhas de míssil, míssil guiado e microfoguetes. Em **vórtex**, compare o som de surgimento, desvio e fogo. As demais categorias incluem tiros, impactos, elementos, interface, eventos e ambiente.

Ao terminar, clique em **COPIAR ESCOLHAS** e cole o JSON na conversa. Apenas ocorrências confirmadas entram no resumo. A opção A é o som atual para ocorrências existentes; nas novas trilhas de míssil, A é uma sugestão e ainda não toca durante o voo. Arquivos locais ficam salvos somente neste navegador; o resumo inclui nome, tamanho e hash do arquivo, mas não o áudio. Ao escolher um arquivo fora do catálogo, mantenha o original para que possamos integrá-lo ao jogo.

As amostras de voo foram preparadas com `python scripts/import-flight-candidates.py D:/sons`. São WAVs mono compactos; as três trilhas escolhidas agora tocam durante a trajetória dos projéteis correspondentes.

As 38 escolhas recebidas em 25/10/2026 estão registradas em `docs/SOUND_CHOICES_APPROVED.json` e aplicadas no jogo. A página de revisão continua tocando os arquivos originais para comparar opções sem alterar o significado de A–E. Os arquivos locais escolhidos foram conferidos pelo SHA-256; sete WAVs foram convertidos por `python scripts/import-approved-sfx.py D:/sons`. O Vórtex de Propulsão reaproveita `meteor.wav`, feito do sonic boom indicado pelo jogador. Tornados e vento elemental mantêm o som independente de `vortex`. As 71 ocorrências ainda sem escolha mantêm os sons atuais.

Em seguida, o impacto de fogo foi atualizado para `koiroylers-fireball-impact-351961.mp3` a pedido do jogador, com o hash registrado no mesmo arquivo de escolhas. Os efeitos novos de Superaquecer e dano de queimadura são gerados por `scripts/import-fire-sfx.py` a partir de gravações adicionais em `D:/sons`.
