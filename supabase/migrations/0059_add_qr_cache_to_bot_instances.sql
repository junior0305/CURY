-- Adiciona colunas para cache do QR Code recebido via webhook da Evolution API.
-- Permite que o Gatekeeper busque o QR diretamente do banco (rápido, sem chamar
-- a Evolution API) quando o evento QRCODE_UPDATED é recebido em tempo real.

ALTER TABLE bot_instances
  ADD COLUMN IF NOT EXISTS last_qr_base64 TEXT,
  ADD COLUMN IF NOT EXISTS last_qr_at     TIMESTAMPTZ;

COMMENT ON COLUMN bot_instances.last_qr_base64 IS 'Último QR Code em base64 recebido via webhook QRCODE_UPDATED da Evolution API';
COMMENT ON COLUMN bot_instances.last_qr_at     IS 'Timestamp do último QR recebido — QRs expiram em ~30s';
