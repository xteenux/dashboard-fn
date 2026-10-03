import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main(){
  const users = await p.user.findMany({select:{id:true,name:true,email:true,role:true,updatedAt:true}});
  for (const u of users){
    const n = await p.transaction.count({where:{userId:u.id}});
    const n7 = await p.transaction.count({where:{userId:u.id,createdAt:{gte:new Date(Date.now()-7*864e5)}}});
    const last = await p.transaction.findFirst({where:{userId:u.id},orderBy:{createdAt:"desc"},select:{createdAt:true,type:true,amount:true,note:true}});
    const acct = await p.account.count({where:{userId:u.id}});
    const cat = await p.category.count({where:{userId:u.id}});
    console.log("SUMMARY", JSON.stringify({email:u.email,role:u.role,userUpdated:u.updatedAt,tx:n,tx7d:n7,lastTx:last,accounts:acct,categories:cat}));
  }
}
main().finally(()=>p.$disconnect());