const Web3 = require('web3')
const web3 = new Web3('https://matic-mumbai.chainstacklabs.com');
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://ipfs.sc2.nl';
const fastify = require('fastify')({ logger: false })
const axios = require('axios');
const multiformats = require('multiformats')

// The chains from: https://github.com/ethereum-lists/chains/tree/master/_data/chains
// These are stored on IPFS with CID: bafybeigopbjf4ilivoqyzrijehjbgwjriwpn3wl3vgelk7skgr3bl7xcim
const CHAINS_CID = 'bafybeigopbjf4ilivoqyzrijehjbgwjriwpn3wl3vgelk7skgr3bl7xcim'

async function getRpc(bid) {
    let filename = `${CHAINS_CID}/eip155-${bid}.json`
    let response = await axios.get(`${IPFS_GATEWAY}/ipfs/${filename}`)
    return response.data.rpc.shift()
}

const fromHexString = hexString =>
  new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

// Silince the darn favicon
fastify.get('/favicon.ico', async (request, reply) => {
    return {}
})

fastify.get('/:cid', async (request, reply) => {
    try {
        let response = await axios.get(`${IPFS_GATEWAY}/ipfs/${request.params.cid}`);
        let rpc = await getRpc(response.data.blockchainID)
        web3.setProvider(rpc)
        let contract = await new web3.eth.Contract(response.data.contractAbi, response.data.contractAccress);
        let value = await contract.methods[response.data.getFunction.functionName](...response.data.getFunction.inputArgs).call();

        if (response.data.getFunction.returnUint256AsCidv0 == true) {
            let hexString = BigInt(value).toString(16).padStart(64, 0)
            let hexArr = fromHexString(hexString)

            // 0x12 = SHA2 256
            const hash = multiformats.digest.create(0x12, hexArr)
            // 0 = CID format 0. You can always convert from this format to v1.
            // 0x70 = DAG-PB
            const cid = multiformats.CID.create(0, 0x70, hash)
            
            // And here we finally have our CID.
            return { value: cid.toString() }

        } else {
            return { value }
        }
    } catch (error) {
        return { error: error }
    }
})

// Run the server!
const start = async () => {
    try {
        console.log(`IPFS Gateway: ${IPFS_GATEWAY}`)
        await fastify.listen(3000, '0.0.0.0')
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}
start()