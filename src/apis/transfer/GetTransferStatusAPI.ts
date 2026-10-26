import { TransferStatus } from '../../../shared/contracts/transfer';
import { sendAPI } from '../../system/api/sendAPI';

export function GetTransferStatusAPI(signal?: AbortSignal) {
  return sendAPI(TransferStatus, {}, signal);
}
