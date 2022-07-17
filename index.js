const Web3 = require('web3')
const web3 = new Web3('https://matic-mumbai.chainstacklabs.com');
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://ipfs.sc2.nl';
const fastify = require('fastify')({ logger: false })
const axios = require('axios');
const multiformats = require('multiformats')
const base58 = require('base58')
const fs = require('fs');

// The chains from: https://github.com/ethereum-lists/chains/tree/master/_data/chains
// These are stored on IPFS with CID: bafybeigopbjf4ilivoqyzrijehjbgwjriwpn3wl3vgelk7skgr3bl7xcim
const CHAINS_CID = 'bafybeigopbjf4ilivoqyzrijehjbgwjriwpn3wl3vgelk7skgr3bl7xcim'

async function getRpc(bid) {
    let filename = `${CHAINS_CID}/eip155-${bid}.json`
    let response = await axios.get(`${IPFS_GATEWAY}/ipfs/${filename}`)
    return response.data.rpc.shift()
}

async function shortCidToValue(cid) {
    // First varify that what we have is allowed in our cid. We wouldn't want nasty hack attempts...
    try {
        if (typeof base58.decode(cid) !== 'number') {
            throw new Error(`CID format is invalid`);
        }

        if (!fs.existsSync(`tempcids/${cid}.json`)) {
            return null;
        }

        // Now try load the json file
        return JSON.parse(fs.readFileSync(`tempcids/${cid}.json`))?.cid;

    } catch (error) {
        return null;
    }
}

const fromHexString = hexString =>
  new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

// Silince the darn favicon
fastify.get('/favicon.ico', async (request, reply) => {
    return {}
})

fastify.get('/register', async (request, reply) => {
    let hash = () => {
        let data = ''
        for (let i = 0; i < 6; i++) {
          data += base58.int_to_base58(Math.floor(Math.random() * 58))
        }
    
        return data;
    };

    let newHash = ''

    // We should only get in here once but just 100 in case. It's to prevent hash collisions.
    for (let i = 0; i < 100; i++) {
        newHash = hash();
        if (!fs.existsSync(`tempcids/${newHash}.json`)) {
            break;
        }
    }

    if (!fs.existsSync("tempcids")) {
        fs.mkdirSync("tempcids", );
    }
    fs.writeFileSync(`tempcids/${newHash}.json`, JSON.stringify({ value: '' }));
    return newHash;
})

fastify.put('/:shortcid', async (request, reply) => {
    try {
        // console.log(request)
        if (request.params.shortcid.length != 6) {
            throw new Error(`Invalid short cid. It's length was ${request.params.shortcid.length}.`);
        }

        let cidVal = shortCidToValue(request.params.shortcid)
        if (!cidVal) {
            throw new Error(`Register a short cid first.`);
        }

        if (!request.body?.cid) {
            throw new Error(`JSON body must contain a cid value`);
        }

        if (request.body.cid.length > 100) {
            throw new Error(`JSON body is capped at 100 bytes!`);
        }
        
        // All checks done. Update cid value and return the cid we got.
        fs.writeFileSync(`tempcids/${request.params.shortcid}.json`, JSON.stringify({ value: request.body.cid }));
        return request.body.cid
    } catch (error) {
        return { error: error.toString() }
    }
})


fastify.get('/:cid', async (request, reply) => {
    try {
        if (request.params.cid.length == 6) {
            let cidVal = await shortCidToValue(request.params.cid)
            if (!cidVal) {
                throw new Error(`Invalid short cid. It's length was ${request.params.cid.length}.`);
            }

            return { value: cidVal }
        }

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
        return { error: error.toString() }
    }
})

// Run the server!
const start = async () => {
    try {
        console.log(`IPFS Gateway: ${IPFS_GATEWAY}`)
        await fastify.listen(80, '0.0.0.0')
    } catch (err) {
        fastify.log.error(err)
        process.exit(1)
    }
}
start()
