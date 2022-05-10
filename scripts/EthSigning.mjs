import {
  makeAuthInfoBytes,
  makeSignDoc,
  encodePubkey,
  makeSignBytes,
} from '@cosmjs/proto-signing';
import { fromBase64 } from '@cosmjs/encoding';

import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx.js';
import * as BytesUtils from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { encodeSecp256k1Signature, encodeSecp256k1Pubkey } from '@cosmjs/amino';
import { convertFromEthAddress } from '../src/utils/AddressConverter.mjs';
import { timeStamp } from '../src/utils/Helpers.mjs'

const publicKeyUrlMapping = {
  evmos: '/ethermint.crypto.v1.ethsecp256k1.PubKey',
  injective: '/injective.crypto.v1beta1.ethsecp256k1.PubKey',
};

const getSignerAddress = async (ethSigner, network) => {
  const ethAddress = await ethSigner.getAddress();
  const signerAddress = convertFromEthAddress(ethAddress, network);
  return signerAddress;
}

const sign = (ethSigner) => async (message) => {
  const signature = await ethSigner
    ._signingKey()
    .signDigest(keccak256(message));
  const splitSignature = BytesUtils.splitSignature(signature);
  const result = BytesUtils.arrayify(
    BytesUtils.concat([splitSignature.r, splitSignature.s])
  );
  return result;
}

const buildTxBytes = ({ SigningClient, ethSigner, chainId, network }) => async ({
  pubkey, accountNumber, sequence, gasPrice, gasLimit, messages, memo,
}) => {
  const encodedPubkey = encodePubkey(
    encodeSecp256k1Pubkey(pubkey)
  );
  encodedPubkey.typeUrl = publicKeyUrlMapping[network];
  const txBody = {
    typeUrl: "/cosmos.tx.v1beta1.TxBody",
    value: {
      messages: messages,
      memo,
    },
  };
  const txBodyBytes = SigningClient.registry.encode(txBody);
  const fee = SigningClient.getFee(gasLimit, gasPrice);
  const authInfoBytes = makeAuthInfoBytes([{ pubkey: encodedPubkey, sequence }], fee.amount, +gasLimit);
  const signDoc = makeSignDoc(txBodyBytes, authInfoBytes, chainId, accountNumber);
  const signature = await sign(ethSigner)(makeSignBytes(signDoc));
  const stdSignature = encodeSecp256k1Signature(pubkey, signature);
  const txRawPartial = TxRaw.fromPartial({
    bodyBytes: txBodyBytes,
    authInfoBytes: authInfoBytes,
    signatures: [fromBase64(stdSignature.signature)],
  });
  const txBytes = TxRaw.encode(txRawPartial).finish();
  return txBytes;
}

const estimateGas = (signingClient) => async (messages, pubkey, sequence) => {
  const anyMsgs = messages.map((m) => signingClient.registry.encodeAsAny(m));
  const encodedPubkey = encodeSecp256k1Pubkey(pubkey);
  const result = await signingClient.forceGetQueryClient().tx.simulate(anyMsgs, '', encodedPubkey, sequence);
  return parseInt(result.gasInfo.gasUsed.toString() * 1.5);
}

const signAndBroadcast = async (client, messages, memo) => {
  try {
    const signerAddress = client.operator.botAddress;
    const StargateSigningClient = client.signingClient.client;
    const { account_number: accountNumber, sequence } = await client.queryClient.getAccount(signerAddress);
    const accounts = await StargateSigningClient.signer.getAccounts();
    const pubkey = accounts[0].pubkey;
    const gasLimit = await estimateGas(StargateSigningClient)(messages, pubkey, sequence);
    timeStamp('GAS_PRICE', client.network.gasPrice);
    const txBytes = await buildTxBytes({
      SigningClient: client.signingClient,
      ethSigner: client.ethSigner,
      network: client.network.name,
      chainId: client.network.chainId,
    })({
      pubkey, accountNumber, sequence,
      gasPrice: client.network.gasPrice,
      gasLimit, memo, messages,
    });
    const result = await StargateSigningClient.broadcastTx(txBytes);
    return result;
  } catch (err) {
    console.log('EVMOS_SIGN_AND_BROADCAST_ERROR', err);
    throw err;
  }
}
export default {
  getSignerAddress,
  signAndBroadcast
}
