import cryptoAddrCodec from "crypto-addr-codec";
import Bech32 from "bech32";

function makeChecksummedHexDecoder(chainId) {
  return (data) => {
    const stripped = cryptoAddrCodec.stripHexPrefix(data);
    if (!cryptoAddrCodec.isValidChecksumAddress(data, chainId || null) &&
      stripped !== stripped.toLowerCase() &&
      stripped !== stripped.toUpperCase()) {
      throw Error('Invalid address checksum');
    }
    return Buffer.from(cryptoAddrCodec.stripHexPrefix(data), 'hex');
  };
}
function makeChecksummedHexEncoder(chainId) {
  return (data) => cryptoAddrCodec.toChecksumAddress(data.toString('hex'), chainId || null);
}
const hexChecksumChain = (name, chainId) => ({
  decoder: makeChecksummedHexDecoder(chainId),
  encoder: makeChecksummedHexEncoder(chainId),
  name,
});
function makeBech32Encoder(prefix) {
  return (data) => Bech32.encode(prefix, Bech32.toWords(data));
}
function makeBech32Decoder(currentPrefix) {
  return (data) => {
    const { prefix, words } = Bech32.decode(data);
    if (prefix !== currentPrefix) {
      throw Error('Unrecognised address format');
    }
    return Buffer.from(Bech32.fromWords(words));
  };
}
const bech32Chain = (name, prefix) => ({
  decoder: makeBech32Decoder(prefix),
  encoder: makeBech32Encoder(prefix),
  name,
});

const ETH = hexChecksumChain('ETH');
const INJECTIVE = bech32Chain('INJECTIVE', 'inj');
const EVMOS = bech32Chain('EVMOS', 'evmos');

const convertFromEthAddress = (ethAddress, network) => {
  const decoderMapping = {
    evmos: EVMOS,
    injective: INJECTIVE,
  }
  const data = ETH.decoder(ethAddress);
  const decoder = decoderMapping[network.toLowerCase()]
  if (!decoder) {
    throw new Error('Decoder not found');
  }
  return decoder.encoder(data);
}

export {
  convertFromEthAddress,
}